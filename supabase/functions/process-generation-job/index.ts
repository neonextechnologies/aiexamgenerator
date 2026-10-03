import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleOptions, jsonResponse, requireUser } from "../_shared/auth.ts";
import {
  completeAndLog,
  fetchProviderRow,
  missingKeyMessage,
  readAiEnv,
  resolveRequestProvider,
} from "../_shared/llm.ts";
import { decryptProviderSecret } from "../_shared/secrets.ts";
import {
  createEmbedding,
  resolveProviderConfig,
  type LlmProviderType,
  type ProviderRow,
} from "../../../src/services/ai-providers/llm-client.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

const STAGE: Record<string, { pct: number; message: string }> = {
  QUEUED: { pct: 0, message: "รอคิวเริ่มต้น" },
  RETRIEVE: { pct: 10, message: "กำลังดึงหลักฐานจากเอกสาร" },
  ANALYZE: { pct: 30, message: "กำลังวิเคราะห์ความครอบคลุม" },
  GENERATE: { pct: 60, message: "กำลังสร้างข้อสอบ" },
  VERIFY: { pct: 85, message: "กำลังตรวจสอบคุณภาพ" },
  DONE: { pct: 100, message: "เสร็จสิ้น" },
};

Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "claim_and_process");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const auth = await authorizeWorker(req);
    if (auth instanceof Response) return auth;

    if (action === "wake") {
      const jobId = String(body.jobId || "");
      if (!jobId) return jsonResponse({ error: "jobId required" }, 400, req);
      const run = processJobById(supabase, jobId, auth.workerId);
      // Detach so HTTP returns immediately; work continues on the platform.
      // deno-lint-ignore no-explicit-any
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(run);
      else void run;
      return jsonResponse({ accepted: true, jobId, detached: true }, 202, req);
    }

    if (action === "process") {
      const jobId = String(body.jobId || "");
      if (!jobId) return jsonResponse({ error: "jobId required" }, 400, req);
      const result = await processJobById(supabase, jobId, auth.workerId);
      return jsonResponse(result, result.success ? 200 : 500, req);
    }

    if (action === "claim_and_process") {
      const limit = Math.min(Number(body.limit || 2), 5);
      const { data: claimed, error } = await supabase.rpc("claim_generation_jobs", {
        p_limit: limit,
        p_worker_id: auth.workerId,
        p_stale_seconds: Number(body.staleSeconds || 900),
      });
      if (error) return jsonResponse({ error: error.message }, 500, req);
      const jobs = (claimed || []) as Array<{ id: string }>;
      if (!jobs.length) return jsonResponse({ success: true, processed: [], message: "queue empty" }, 200, req);

      // Process sequentially to avoid provider rate spikes; still detached from browser.
      const results = [];
      for (const job of jobs) {
        results.push(await runClaimedJob(supabase, job.id, auth.workerId));
      }
      return jsonResponse({ success: true, processed: results }, 200, req);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400, req);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, req);
  }
});

async function authorizeWorker(req: Request): Promise<{ workerId: string; userId?: string } | Response> {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const workerSecret = Deno.env.get("GENERATION_WORKER_SECRET") || "";
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-worker-secret") || "";

  if (serviceRole && token === serviceRole) {
    return { workerId: `svc-${crypto.randomUUID().slice(0, 8)}` };
  }
  if (workerSecret && (token === workerSecret || headerSecret === workerSecret)) {
    return { workerId: `sec-${crypto.randomUUID().slice(0, 8)}` };
  }

  const user = await requireUser(req);
  if (user instanceof Response) return user;
  return { workerId: `user-${user.userId.slice(0, 8)}`, userId: user.userId };
}

async function processJobById(supabase: SupabaseAdmin, jobId: string, workerId: string) {
  // Prefer claim RPC for a specific id by temporarily ensuring it's claimable.
  const { data: existing } = await supabase.from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!existing) return { success: false, error: "Job not found", jobId };
  if (existing.status === "completed") return { success: true, jobId, status: "completed", alreadyDone: true };
  if (existing.status === "failed" && Number(existing.attempt_count || 0) >= Number(existing.max_attempts || 3)) {
    return { success: false, jobId, status: "failed", error: existing.error_message || "max attempts reached" };
  }

  await supabase.from("generation_jobs").update({
    status: "running",
    locked_at: new Date().toISOString(),
    locked_by: workerId,
    worker_heartbeat_at: new Date().toISOString(),
    attempt_count: Number(existing.attempt_count || 0) + (existing.status === "running" ? 0 : 1),
    started_at: existing.started_at || new Date().toISOString(),
  }).eq("id", jobId);

  return runClaimedJob(supabase, jobId, workerId);
}

async function runClaimedJob(supabase: SupabaseAdmin, jobId: string, workerId: string) {
  const { data: job } = await supabase.from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return { success: false, jobId, error: "missing job" };
  const request = (job.request_json || {}) as Record<string, unknown>;
  if (!request.courseId) {
    await failJob(supabase, jobId, "request_json.courseId missing", job);
    return { success: false, jobId, error: "invalid request_json" };
  }

  try {
    await setStage(supabase, jobId, "RETRIEVE", workerId);
    const evidencePack = await retrieveEvidence(supabase, request);
    await heartbeat(supabase, jobId, workerId);

    await setStage(supabase, jobId, "ANALYZE", workerId);
    const analysis = analyzeRequest(request, evidencePack);
    if (analysis.insufficientEvidence || analysis.decision === "reject") {
      await failJob(supabase, jobId, analysis.reason.join("; ") || "INSUFFICIENT_EVIDENCE", job, {
        result_json: { insufficientEvidence: true, analysis, evidencePack },
        status: "failed",
      });
      return { success: false, jobId, error: "INSUFFICIENT_EVIDENCE", insufficientEvidence: true };
    }

    await setStage(supabase, jobId, "GENERATE", workerId);
    const generated = await generateQuestions(supabase, request, evidencePack, String(job.created_by || request.createdBy || "unknown"));
    if (!generated.ok) {
      const retryable = generated.demo || generated.status >= 500;
      await failJob(supabase, jobId, generated.error, job, { retryable });
      return { success: false, jobId, error: generated.error, demoMode: generated.demo };
    }

    await setStage(supabase, jobId, "VERIFY", workerId, { model: generated.model });
    const verified = verifyBatch(generated.questions, evidencePack, request.knowledgeBounded !== false);
    const rows = generated.questions.map((q, i) => mapQuestionRow(q, request, evidencePack, verified[i], generated.model, String(job.created_by || "")));
    const { data: savedQuestions, error: insertError } = await supabase.from("questions").insert(rows).select();
    if (insertError) {
      await failJob(supabase, jobId, insertError.message, job);
      return { success: false, jobId, error: insertError.message };
    }

    const result = {
      success: true,
      status: "completed",
      mode: request.mode || "ai",
      executionId: `exec-worker-${jobId}`,
      questions: generated.questions,
      savedQuestions: savedQuestions || [],
      verification: verified,
      evidencePack,
      analysis,
      usage: generated.usage,
    };

    await supabase.from("generation_jobs").update({
      status: "completed",
      progress_pct: 100,
      current_stage: "DONE",
      stage_message: STAGE.DONE.message,
      generated_count: (savedQuestions || []).length,
      failed_count: Math.max(0, Number(request.numberOfQuestions || 0) - (savedQuestions || []).length),
      total_questions: Number(request.numberOfQuestions || (savedQuestions || []).length),
      input_tokens: generated.usage.inputTokens,
      output_tokens: generated.usage.outputTokens,
      estimated_cost_usd: generated.usage.estimatedCostUsd,
      model: generated.model,
      result_json: result,
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      error_message: null,
      last_error: null,
    }).eq("id", jobId);

    await supabase.from("notifications").insert({
      id: `n-${crypto.randomUUID()}`,
      user_id: job.created_by,
      type: "generation_completed",
      title: "สร้างข้อสอบเสร็จสิ้น (Background)",
      message: `สร้าง ${(savedQuestions || []).length} ข้อ ผ่าน worker แล้วส่งคิวตรวจ`,
      link: "/review",
      read: false,
      created_at: new Date().toISOString(),
    }).catch(() => null);

    return { success: true, jobId, savedCount: (savedQuestions || []).length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(supabase, jobId, message, job, { retryable: true });
    return { success: false, jobId, error: message };
  }
}

async function failJob(
  supabase: SupabaseAdmin,
  jobId: string,
  message: string,
  job: Record<string, unknown>,
  opts: { retryable?: boolean; result_json?: unknown; status?: string } = {},
) {
  const attempts = Number(job.attempt_count || 1);
  const maxAttempts = Number(job.max_attempts || 3);
  const canRetry = opts.retryable !== false && attempts < maxAttempts;
  await supabase.from("generation_jobs").update({
    status: canRetry ? "queued" : (opts.status || "failed"),
    error_message: message,
    last_error: message,
    progress_pct: canRetry ? Number(job.progress_pct || 0) : 100,
    current_stage: canRetry ? "QUEUED" : "DONE",
    stage_message: canRetry ? `รอลองใหม่ (${attempts}/${maxAttempts}): ${message}` : message,
    result_json: opts.result_json ?? null,
    locked_at: null,
    locked_by: null,
    completed_at: canRetry ? null : new Date().toISOString(),
  }).eq("id", jobId);
}

async function setStage(supabase: SupabaseAdmin, jobId: string, stage: string, workerId: string, extras: Record<string, unknown> = {}) {
  const meta = STAGE[stage] || { pct: 0, message: stage };
  await supabase.from("generation_jobs").update({
    status: "running",
    progress_pct: meta.pct,
    current_stage: stage,
    stage_message: meta.message,
    worker_heartbeat_at: new Date().toISOString(),
    locked_by: workerId,
    locked_at: new Date().toISOString(),
    ...extras,
  }).eq("id", jobId);
}

async function heartbeat(supabase: SupabaseAdmin, jobId: string, workerId: string) {
  await supabase.from("generation_jobs").update({
    worker_heartbeat_at: new Date().toISOString(),
    locked_by: workerId,
    locked_at: new Date().toISOString(),
  }).eq("id", jobId);
}

async function retrieveEvidence(supabase: SupabaseAdmin, request: Record<string, unknown>) {
  const documentIds = (request.documentIds || []) as string[];
  const query = `${request.questionType || ""} ${request.bloomLevel || ""} ${request.difficulty || ""} ${((request.learningOutcomeCodes as string[]) || []).join(" ")}`;
  const topK = 10;
  const embedCfg = await resolveEmbeddingProvider(supabase, request.providerId as string | null);
  let chunks: Array<Record<string, unknown>> = [];
  let mode = "lexical";

  if (embedCfg && documentIds.length) {
    try {
      const emb = await createEmbedding({
        providerType: embedCfg.providerType as LlmProviderType,
        apiKey: embedCfg.apiKey,
        model: embedCfg.model,
        baseUrl: embedCfg.baseUrl,
        text: query,
        organizationId: embedCfg.organizationId,
        projectId: embedCfg.projectId,
      });
      const { data, error } = await supabase.rpc("match_document_chunks", {
        query_embedding: `[${emb.embedding.join(",")}]`,
        match_document_ids: documentIds,
        match_count: topK,
        match_threshold: 0.15,
      });
      if (!error && Array.isArray(data) && data.length) {
        chunks = data as Array<Record<string, unknown>>;
        mode = "pgvector";
      }
    } catch {
      // lexical below
    }
  }

  if (!chunks.length && documentIds.length) {
    let q = supabase.from("document_chunks").select("*").limit(200);
    q = q.in("document_id", documentIds);
    const { data } = await q;
    const scored = (data || [])
      .map((c: { content: string }) => ({ c, score: lexicalScore(query, c.content) }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, topK)
      .map((x: { c: Record<string, unknown> }) => x.c);
    chunks = scored;
    if (!chunks.length) {
      const { data: docs } = await supabase.from("documents").select("id, course_id, extracted_text").in("id", documentIds);
      for (const d of docs || []) {
        if (!d.extracted_text) continue;
        // Lightweight inline chunk insert without embeddings (worker continue); backfill later.
        const parts = chunkText(String(d.extracted_text));
        if (parts.length) {
          await supabase.from("document_chunks").delete().eq("document_id", d.id);
          await supabase.from("document_chunks").insert(parts.map((content, idx) => ({
            document_id: d.id,
            course_id: d.course_id,
            chunk_index: idx,
            content,
            page_number: idx + 1,
            token_count: Math.ceil(content.length / 4),
            metadata_json: {},
          })));
        }
      }
      const { data: again } = await supabase.from("document_chunks").select("*").in("document_id", documentIds).limit(200);
      chunks = (again || [])
        .map((c: { content: string }) => ({ c, score: lexicalScore(query, c.content) }))
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, topK)
        .map((x: { c: Record<string, unknown> }) => x.c);
    }
  }

  const citations = chunks.map((c) => ({
    chunk_id: c.id,
    document_id: c.document_id,
    page: c.page_number,
    section: c.section,
    quote: String(c.content || "").slice(0, 180),
    score: lexicalScore(query, String(c.content || "")),
  }));
  const coverageScore = Math.min(1, chunks.length / topK);
  const retrievalConfidence = citations.length
    ? citations.reduce((s, c) => s + c.score, 0) / citations.length
    : 0;

  return {
    courseId: request.courseId,
    learningOutcomes: request.learningOutcomeCodes || [],
    documents: documentIds,
    retrievedChunks: chunks,
    citations,
    coverageScore,
    retrievalConfidence,
    retrievalMode: mode,
  };
}

function analyzeRequest(request: Record<string, unknown>, evidence: { retrievedChunks: unknown[]; retrievalConfidence: number; coverageScore: number }) {
  const chunks = evidence.retrievedChunks.length;
  const insufficient = request.knowledgeBounded !== false && request.mode !== "manual" && chunks === 0;
  return {
    decision: insufficient ? "reject" : (evidence.coverageScore < 0.3 ? "revise" : "approve"),
    reason: insufficient
      ? ["INSUFFICIENT_EVIDENCE: ไม่พบเนื้อหาเพียงพอจากเอกสารที่เลือก"]
      : ["Worker analysis: evidence available for controlled generation"],
    coverage: {
      documents: Array.isArray(request.documentIds) && (request.documentIds as unknown[]).length ? 1 : 0,
      chunks: Math.min(1, chunks / 5),
      retrieval: evidence.retrievalConfidence,
      overall: evidence.coverageScore,
    },
    recommendedQuestionTypes: [request.questionType].filter(Boolean),
    recommendedBloomLevels: [request.bloomLevel].filter(Boolean),
    recommendedDifficulty: [request.difficulty].filter(Boolean),
    generationPlan: [],
    insufficientEvidence: insufficient,
  };
}

async function generateQuestions(
  supabase: SupabaseAdmin,
  request: Record<string, unknown>,
  evidencePack: { retrievedChunks: Array<{ content?: string }> },
  userId: string,
) {
  const config = await resolveDecryptedProvider(supabase, request.providerId as string | null);
  if (config.demo || !config.apiKey) {
    return { ok: false as const, demo: true, status: 503, error: config.reason || missingKeyMessage(config), questions: [], usage: emptyUsage(), model: "" };
  }

  const evidenceText = (evidencePack.retrievedChunks || [])
    .map((c, i) => `[#${i + 1}] ${c.content || ""}`)
    .join("\n\n")
    .slice(0, 30000);

  if (request.knowledgeBounded !== false && !evidenceText.trim()) {
    return { ok: false as const, demo: false, status: 200, error: "INSUFFICIENT_EVIDENCE", questions: [], usage: emptyUsage(), model: config.model };
  }

  const includeRubric = request.includeRubric === true
    || request.questionType === "essay"
    || request.questionType === "case_study";
  const rubricInstruction = includeRubric
    ? `For every essay or case_study question you MUST include a "rubric" object with totalMarks=${request.marksPerQuestion}.`
    : "Rubric optional except essay/case_study.";

  const { data: tpl } = await supabase.from("prompt_templates").select("*").eq("code", "question_generation").eq("is_active", true).maybeSingle();
  const system = tpl?.system_prompt
    || `You are an expert educational assessment designer. Use ONLY provided evidence. Return JSON {"questions":[...]} with fields questionText,questionType,language,choices,correctAnswer,explanation,bloomLevel,difficulty,learningOutcomeCodes,topic,tags,marks,estimatedAnswerTimeMinutes,sourceReference,qualityFlags,rubric,predictedBloomLevel,predictedDifficulty. ${rubricInstruction}`;
  const user = `Create ${request.numberOfQuestions} ${request.language} questions.
Type=${request.questionType} Bloom=${request.bloomLevel} Difficulty=${request.difficulty} Marks=${request.marksPerQuestion}
CLO=${((request.learningOutcomeCodes as string[]) || []).join(", ")}
Mode=${request.mode}
Evidence:\n${evidenceText || "(none)"}`;

  const completion = await completeAndLog(supabase, config, {
    system,
    user,
    userId,
    courseId: String(request.courseId || ""),
    requestType: "question_generation_v2_worker",
  });
  if (!completion.ok) {
    return {
      ok: false as const,
      demo: completion.demo,
      status: completion.status,
      error: completion.error,
      questions: [],
      usage: emptyUsage(),
      model: config.model,
    };
  }

  let questions = completion.questions as Record<string, unknown>[];
  if (includeRubric) {
    for (const q of questions) {
      const qType = String(q.questionType || request.questionType);
      if ((qType === "essay" || qType === "case_study") && !q.rubric) {
        const retry = await completeAndLog(supabase, config, {
          system: "Return JSON {\"rubric\":{totalMarks,criteria:[...]}} with Thai levels ดีเยี่ยม/ดี/พอใช้/ต้องปรับปรุง.",
          user: `Question: ${q.questionText}\nMarks: ${q.marks || request.marksPerQuestion}`,
          userId,
          courseId: String(request.courseId || ""),
          requestType: "rubric_retry",
        });
        if (retry.ok && retry.parsed && typeof retry.parsed === "object") {
          const rp = retry.parsed as Record<string, unknown>;
          q.rubric = rp.rubric || rp;
        }
      }
    }
  }

  return {
    ok: true as const,
    demo: false,
    status: 200,
    error: "",
    questions,
    usage: completion.usage,
    model: completion.model,
  };
}

function verifyBatch(
  questions: Record<string, unknown>[],
  evidencePack: { retrievedChunks: unknown[] },
  knowledgeBounded: boolean,
) {
  return questions.map((q) => {
    const text = String(q.questionText || q.question_text || "");
    const violations: string[] = [];
    const checks = [];
    if (!text.trim()) {
      violations.push("missing_question_text");
      checks.push({ code: "HAS_TEXT", status: "fail", message: "missing" });
    } else {
      checks.push({ code: "HAS_TEXT", status: "pass", message: "OK" });
    }
    const clo = (q.learningOutcomeCodes || q.learning_outcome_codes || []) as unknown[];
    if (!clo.length) violations.push("missing_clo");
    if (knowledgeBounded && !(evidencePack.retrievedChunks?.length)) violations.push("insufficient_evidence");
    const status = violations.length ? "fail" : "pass";
    return {
      status,
      score: status === "pass" ? 90 : 40,
      checks,
      violations,
      recommendations: ["Worker deterministic verification"],
      dimensions: {
        grounding: knowledgeBounded ? (violations.includes("insufficient_evidence") ? 20 : 80) : 70,
        correctness: 80,
        clarity: text.length > 20 ? 80 : 50,
        clo_alignment: clo.length ? 90 : 10,
        bloom_alignment: 80,
        difficulty_alignment: 80,
        distractor_quality: 70,
        language_quality: 80,
        traceability: evidencePack.retrievedChunks?.length ? 85 : 40,
      },
    };
  });
}

function mapQuestionRow(
  q: Record<string, unknown>,
  request: Record<string, unknown>,
  evidencePack: { citations?: Array<{ document_id: unknown; page?: unknown; section?: unknown; quote?: unknown }> },
  verification: { status: string; score: number; violations: string[]; dimensions: Record<string, number> },
  model: string,
  createdBy: string,
) {
  const qType = String(q.questionType || request.questionType);
  const marks = Number(q.marks || request.marksPerQuestion || 1);
  const citation = evidencePack.citations?.[0];
  return {
    course_id: request.courseId,
    question_text: q.questionText || "",
    question_type: qType,
    language: q.language || request.language || "th",
    choices: q.choices || null,
    correct_answer: typeof q.correctAnswer === "string" ? q.correctAnswer : JSON.stringify(q.correctAnswer ?? ""),
    explanation: q.explanation || "",
    intended_bloom_level: q.bloomLevel || request.bloomLevel,
    ai_predicted_bloom_level: q.predictedBloomLevel || q.bloomLevel || request.bloomLevel,
    intended_difficulty: q.difficulty || request.difficulty,
    ai_predicted_difficulty: q.predictedDifficulty || q.difficulty || request.difficulty,
    marks,
    estimated_answer_time_minutes: q.estimatedAnswerTimeMinutes || 2,
    source_references: citation
      ? [{ document_id: citation.document_id, file_name: null, page: citation.page || 1, section: citation.section || "", quote: citation.quote || null }]
      : null,
    learning_outcome_codes: q.learningOutcomeCodes || request.learningOutcomeCodes || [],
    quality_flags: verification.violations || [],
    topic: q.topic || null,
    tags: Array.isArray(q.tags) ? q.tags : [],
    rubric: q.rubric || null,
    status: verification.status === "fail" ? "validation_failed" : "ready_for_review",
    quality_score: verification.score,
    quality_dimensions: verification.dimensions,
    verification_status: verification.status,
    verification_score: verification.score,
    source_type: "ai_generated",
    generated_by_ai: true,
    ai_model: model,
    created_by: createdBy || request.createdBy,
    generation_mode: request.mode || "ai",
  };
}

async function resolveDecryptedProvider(supabase: SupabaseAdmin, providerId?: string | null) {
  const row = await fetchProviderRow(supabase, providerId);
  if (row?.encrypted_api_key) {
    const mode = (row as ProviderRow & { key_encryption?: string }).key_encryption;
    const plain = await decryptProviderSecret(supabase, row.encrypted_api_key, mode);
    if (plain) {
      return resolveProviderConfig({
        provider: { ...row, encrypted_api_key: btoa(plain) },
        env: readAiEnv(),
        overrideKey: plain,
      });
    }
  }
  return resolveRequestProvider(supabase, providerId);
}

async function resolveEmbeddingProvider(supabase: SupabaseAdmin, providerId?: string | null) {
  const preferred = providerId ? await resolveDecryptedProvider(supabase, providerId) : null;
  if (preferred && !preferred.demo && preferred.apiKey && preferred.providerType !== "anthropic") {
    const row = await fetchProviderRow(supabase, preferred.providerId);
    return {
      ...preferred,
      model: row?.embedding_model || (preferred.providerType === "gemini" ? "text-embedding-004" : "text-embedding-3-small"),
    };
  }
  for (const id of ["prov-openai", "prov-gemini", "prov-compat"]) {
    const cfg = await resolveDecryptedProvider(supabase, id);
    if (!cfg.demo && cfg.apiKey && cfg.providerType !== "anthropic") {
      const row = await fetchProviderRow(supabase, id);
      return {
        ...cfg,
        model: row?.embedding_model || (cfg.providerType === "gemini" ? "text-embedding-004" : "text-embedding-3-small"),
      };
    }
  }
  const env = readAiEnv();
  if (env.OPENAI_API_KEY) {
    return resolveProviderConfig({
      provider: { provider_type: "openai", embedding_model: "text-embedding-3-small", generation_model: "gpt-4o" } as ProviderRow,
      env,
    });
  }
  return null;
}

function lexicalScore(query: string, content: string): number {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const c = content.toLowerCase();
  if (!q.length) return 0;
  let hit = 0;
  for (const w of q) if (c.includes(w)) hit++;
  return hit / q.length;
}

function chunkText(text: string, size = 800): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += size) parts.push(clean.slice(i, i + size));
  return parts;
}

function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, latencyMs: 0, provider: "none", model: "" };
}

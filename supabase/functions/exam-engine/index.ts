import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleOptions, jsonResponse, requireUser } from "../_shared/auth.ts";
import {
  completeAndLog,
  missingKeyMessage,
  probeRequestProvider,
  resolveRequestProvider,
  fetchProviderRow,
  readAiEnv,
} from "../_shared/llm.ts";
import { decryptProviderSecret, encryptProviderSecret, hasProviderSecretsKey, hintFromKey } from "../_shared/secrets.ts";
import {
  completeJson,
  createEmbedding,
  extractQuestions,
  padOrTrimEmbedding,
  parseModelJson,
  resolveProviderConfig,
  type LlmProviderType,
  type ProviderRow,
} from "../../../src/services/ai-providers/llm-client.ts";

type Action =
  | "orchestrate"
  | "generate"
  | "analyze"
  | "verify"
  | "chat"
  | "ingest"
  | "retrieve"
  | "knowledge_health"
  | "backfill_embeddings"
  | "provider_test"
  | "provider_save_key"
  | "provider_migrate_keys"
  | "predict_taxonomy"
  | "rubric_retry"
  | "manual_assist"
  | "process_generation_job"
  | "get_prompt";

type SupabaseAdmin = ReturnType<typeof createClient>;

Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await req.json();
    const action = (body.action || "orchestrate") as Action;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (action === "provider_test") {
      const providerId = body.providerId as string;
      if (providerId === "prov-demo") return jsonResponse({ ok: true, message: "Demo provider พร้อมใช้งาน" }, 200, req);
      const { data: provider } = await supabase.from("ai_providers").select("id").eq("id", providerId).maybeSingle();
      if (!provider) return jsonResponse({ ok: false, message: "Provider not found" }, 404, req);
      const config = await resolveDecryptedProvider(supabase, providerId, body.apiKey as string | undefined);
      const result = await probeRequestProvider(config);
      await supabase.from("ai_providers").update({
        last_tested_at: new Date().toISOString(),
        last_test_status: result.status,
      }).eq("id", providerId);
      return jsonResponse({ ok: result.ok, message: result.message }, 200, req);
    }

    if (action === "provider_save_key") {
      const providerId = String(body.providerId || "");
      const apiKey = String(body.apiKey || "").trim();
      if (!providerId || !apiKey) return jsonResponse({ error: "providerId and apiKey required" }, 400, req);
      if (!hasProviderSecretsKey()) {
        return jsonResponse({
          error: "PROVIDER_SECRETS_KEY ยังไม่ได้ตั้งค่าใน Edge secrets — ไม่สามารถเข้ารหัส API key ได้",
        }, 503, req);
      }
      const encrypted = await encryptProviderSecret(supabase, apiKey);
      const { error } = await supabase.from("ai_providers").update({
        encrypted_api_key: encrypted.ciphertext,
        key_encryption: encrypted.mode,
        key_hint: hintFromKey(apiKey),
        updated_at: new Date().toISOString(),
      }).eq("id", providerId);
      if (error) return jsonResponse({ error: error.message }, 500, req);
      return jsonResponse({ success: true, key_hint: hintFromKey(apiKey), key_encryption: encrypted.mode }, 200, req);
    }

    if (action === "provider_migrate_keys") {
      if (!hasProviderSecretsKey()) {
        return jsonResponse({ error: "PROVIDER_SECRETS_KEY required" }, 503, req);
      }
      const { data: rows } = await supabase.from("ai_providers").select("id,encrypted_api_key,key_encryption");
      let migrated = 0;
      const errors: string[] = [];
      for (const row of rows || []) {
        if (!row.encrypted_api_key) continue;
        if (row.key_encryption === "pgcrypto" || row.key_encryption === "aes_gcm") continue;
        try {
          const plain = await decryptProviderSecret(supabase, row.encrypted_api_key, row.key_encryption || "legacy_base64");
          if (!plain) continue;
          const encrypted = await encryptProviderSecret(supabase, plain);
          await supabase.from("ai_providers").update({
            encrypted_api_key: encrypted.ciphertext,
            key_encryption: encrypted.mode,
            key_hint: hintFromKey(plain),
          }).eq("id", row.id);
          migrated++;
        } catch (e) {
          errors.push(`${row.id}: ${(e as Error).message}`);
        }
      }
      return jsonResponse({ success: true, migrated, errors }, 200, req);
    }

    if (action === "ingest") {
      const { documentId, text, courseId } = body;
      if (!documentId || !text) return jsonResponse({ error: "documentId and text required" }, 400, req);
      await supabase.from("document_chunks").delete().eq("document_id", documentId);
      const size = 800;
      const parts: string[] = [];
      const clean = String(text).replace(/\s+/g, " ").trim();
      for (let i = 0; i < clean.length; i += size) parts.push(clean.slice(i, i + size));

      const embedCfg = await resolveEmbeddingProvider(supabase, body.providerId);
      const rows = [];
      for (let idx = 0; idx < parts.length; idx++) {
        const content = parts[idx];
        let embedding: number[] | null = null;
        let embeddingModel: string | null = null;
        let embeddingProvider: string | null = null;
        if (embedCfg) {
          try {
            const emb = await createEmbedding({
              providerType: embedCfg.providerType as LlmProviderType,
              apiKey: embedCfg.apiKey,
              model: embedCfg.model,
              baseUrl: embedCfg.baseUrl,
              text: content,
              organizationId: embedCfg.organizationId,
              projectId: embedCfg.projectId,
            });
            embedding = emb.embedding;
            embeddingModel = emb.model;
            embeddingProvider = embedCfg.providerType;
          } catch {
            // keep chunk without embedding
          }
        }
        rows.push({
          document_id: documentId,
          course_id: courseId || null,
          chunk_index: idx,
          content,
          page_number: idx + 1,
          section: body.section || null,
          token_count: Math.ceil(content.length / 4),
          metadata_json: {},
          embedding: embedding ? `[${embedding.join(",")}]` : null,
          embedding_model: embeddingModel,
          embedding_provider: embeddingProvider,
          embedding_dims: embedding?.length || null,
          embedded_at: embedding ? new Date().toISOString() : null,
        });
      }
      if (rows.length) {
        const { error } = await supabase.from("document_chunks").insert(rows);
        if (error) return jsonResponse({ error: error.message }, 500, req);
      }
      await supabase.from("documents").update({
        processing_stage: "indexed",
        status: "indexed",
        updated_at: new Date().toISOString(),
      }).eq("id", documentId);
      return jsonResponse({
        success: true,
        chunkCount: parts.length,
        embedded: rows.filter(r => r.embedding).length,
      }, 200, req);
    }

    if (action === "retrieve") {
      const query = String(body.query || "");
      const documentIds = (body.documentIds || []) as string[];
      const topK = Number(body.topK || 8);
      const embedCfg = await resolveEmbeddingProvider(supabase, body.providerId);
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
            return jsonResponse({ success: true, mode: "pgvector", chunks: data }, 200, req);
          }
        } catch {
          // lexical below
        }
      }
      let q = supabase.from("document_chunks").select("*").limit(200);
      if (documentIds.length) q = q.in("document_id", documentIds);
      const { data: chunks } = await q;
      const scored = (chunks || [])
        .map((c: { content: string }) => ({
          c,
          score: lexicalScore(query, c.content),
        }))
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, topK)
        .map((x: { c: unknown }) => x.c);
      return jsonResponse({ success: true, mode: "lexical", chunks: scored }, 200, req);
    }

    if (action === "knowledge_health") {
      const { count: total } = await supabase.from("document_chunks").select("*", { count: "exact", head: true });
      const { count: embedded } = await supabase
        .from("document_chunks")
        .select("*", { count: "exact", head: true })
        .not("embedding", "is", null);
      const embedCfg = await resolveEmbeddingProvider(supabase, null);
      const mode = embedCfg && (embedded || 0) > 0 ? "pgvector" : embedCfg ? "pgvector" : "lexical";
      const message = embedCfg
        ? `Semantic retrieval พร้อม (provider=${embedCfg.providerType}, model=${embedCfg.model}); chunks ที่ฝังแล้ว ${embedded || 0}/${total || 0}`
        : `ยังไม่มี embedding provider — ใช้ lexical fallback; chunks ${total || 0}`;
      await supabase.from("knowledge_providers").update({
        last_health_at: new Date().toISOString(),
        last_health_status: embedCfg ? "ok" : "degraded",
        last_health_message: message,
      }).eq("id", "kp-pgvector");
      return jsonResponse({
        ok: true,
        mode,
        message,
        embeddedChunks: embedded || 0,
        totalChunks: total || 0,
      }, 200, req);
    }

    if (action === "backfill_embeddings") {
      const limit = Math.min(Number(body.limit || 100), 500);
      let q = supabase.from("document_chunks").select("id,content,document_id").is("embedding", null).limit(limit);
      if (Array.isArray(body.documentIds) && body.documentIds.length) {
        q = q.in("document_id", body.documentIds);
      }
      const { data: chunks } = await q;
      const embedCfg = await resolveEmbeddingProvider(supabase, body.providerId);
      if (!embedCfg) {
        return jsonResponse({ updated: 0, errors: ["ไม่พบ embedding provider (ตั้งค่า OpenAI/Gemini/compatible)"] }, 200, req);
      }
      let updated = 0;
      const errors: string[] = [];
      for (const chunk of chunks || []) {
        try {
          const emb = await createEmbedding({
            providerType: embedCfg.providerType as LlmProviderType,
            apiKey: embedCfg.apiKey,
            model: embedCfg.model,
            baseUrl: embedCfg.baseUrl,
            text: chunk.content,
            organizationId: embedCfg.organizationId,
            projectId: embedCfg.projectId,
          });
          const { error } = await supabase.from("document_chunks").update({
            embedding: `[${emb.embedding.join(",")}]`,
            embedding_model: emb.model,
            embedding_provider: embedCfg.providerType,
            embedding_dims: emb.embedding.length,
            embedded_at: new Date().toISOString(),
          }).eq("id", chunk.id);
          if (error) errors.push(error.message);
          else updated++;
        } catch (e) {
          errors.push(`${chunk.id}: ${(e as Error).message}`);
        }
      }
      return jsonResponse({ success: true, updated, errors }, 200, req);
    }

    if (action === "chat") {
      const message = String(body.message || "");
      const context = body.context || {};
      const template = await loadPrompt(supabase, "chat_assistant");
      const system = template?.system_prompt
        || "You are a Thai/English exam design assistant. Propose actions only; confirm before mutating data.";
      const userTpl = template?.user_template
        || "Context page={{page}} course={{courseId}}\nUser: {{message}}";
      const user = renderTemplate(userTpl, {
        page: context.page || "-",
        courseId: context.courseId || "-",
        examId: context.examId || "-",
        questionId: context.questionId || "-",
        message,
      });
      const config = await resolveDecryptedProvider(supabase, body.providerId);
      if (!config.demo && config.apiKey) {
        const completion = await completeAndLog(supabase, config, {
          system,
          user,
          userId: auth.userId,
          courseId: context.courseId || null,
          requestType: "chat_assistant",
        });
        if (completion.ok) {
          const text = typeof completion.parsed === "object" && completion.parsed && "reply" in (completion.parsed as object)
            ? String((completion.parsed as { reply?: string }).reply || "")
            : (typeof completion.parsed === "string" ? completion.parsed : JSON.stringify(completion.parsed));
          // Prefer free-text from model — re-call without forcing question extract
          const free = await completeJson({
            providerType: config.providerType as LlmProviderType,
            apiKey: config.apiKey,
            model: config.model,
            baseUrl: config.baseUrl,
            system: system + "\nRespond as plain helpful text (Thai preferred). If proposing to open the generate wizard, end with ACTION:open_generate_wizard",
            user,
            temperature: 0.4,
            maxTokens: Math.min(config.maxTokens, 1200),
            timeoutMs: config.timeoutMs,
            jsonMode: false,
            organizationId: config.organizationId,
            projectId: config.projectId,
          }).catch(() => null);
          const content = free?.text || text || "รับทราบคำขอของคุณแล้ว";
          const proposedActions = /ACTION:open_generate_wizard|สร้างข้อสอบ/i.test(content + message)
            ? [{
              id: `act-${Date.now()}`,
              action_type: "open_generate_wizard",
              payload: { courseId: context.courseId },
              preview: "เปิดหน้าสร้างข้อสอบด้วย AI/Hybrid",
              status: "proposed",
            }]
            : [];
          return jsonResponse({
            success: true,
            reply: { id: `m-${Date.now()}`, role: "assistant", content: content.replace(/\s*ACTION:open_generate_wizard/i, "").trim() },
            proposedActions,
            modelBased: true,
          }, 200, req);
        }
      }
      // Labeled fallback when no LLM
      const reply =
        `[Heuristic fallback — ไม่มี LLM]\n` +
        `บริบท: course=${context.courseId || "-"} page=${context.page || "-"}\n` +
        `คำขอ: ${message}\n` +
        `แนะนำ: Manual / Hybrid / AI ตาม pipeline Rules + Evidence + Verification`;
      return jsonResponse({
        success: true,
        reply: { id: `m-${Date.now()}`, role: "assistant", content: reply },
        proposedActions: /สร้าง/i.test(message) ? [{
          id: `act-${Date.now()}`,
          action_type: "open_generate_wizard",
          payload: { courseId: context.courseId },
          preview: "เปิดหน้าสร้างข้อสอบด้วย AI/Hybrid",
          status: "proposed",
        }] : [],
        modelBased: false,
        heuristicFallback: true,
      }, 200, req);
    }

    if (action === "analyze") {
      const request = body.request || {};
      const evidencePack = body.evidencePack || {};
      const heuristic = heuristicAnalyze(request, evidencePack);
      const config = await resolveDecryptedProvider(supabase, request.providerId || body.providerId);
      const template = await loadPrompt(supabase, "analyze_request");
      if (!config.demo && config.apiKey) {
        const completion = await completeAndLog(supabase, {
          ...config,
          model: (await fetchProviderRow(supabase, request.providerId))?.analysis_model || config.model,
        }, {
          system: template?.system_prompt || "Return JSON analysis decision for exam generation.",
          user: renderTemplate(template?.user_template || "Request: {{requestJson}}\nEvidence:\n{{evidence}}", {
            requestJson: JSON.stringify(request),
            coverage: JSON.stringify(heuristic.coverage),
            evidence: summarizeEvidence(evidencePack),
          }),
          userId: auth.userId,
          courseId: request.courseId || null,
          requestType: "analyze_request",
        });
        if (completion.ok && completion.parsed && typeof completion.parsed === "object") {
          return jsonResponse({
            ...heuristic,
            ...(completion.parsed as object),
            modelBased: true,
            heuristicFallback: false,
          }, 200, req);
        }
      }
      return jsonResponse({ ...heuristic, modelBased: false, heuristicFallback: true }, 200, req);
    }

    if (action === "verify") {
      const question = body.question || {};
      const evidencePack = body.evidencePack || {};
      const knowledgeBounded = body.knowledgeBounded !== false;
      const heuristic = heuristicVerify(question, evidencePack, knowledgeBounded);
      const config = await resolveDecryptedProvider(supabase, body.providerId);
      const template = await loadPrompt(supabase, "verify_question");
      const providerRow = await fetchProviderRow(supabase, body.providerId);
      if (!config.demo && config.apiKey) {
        const completion = await completeAndLog(supabase, {
          ...config,
          model: providerRow?.verification_model || config.model,
        }, {
          system: template?.system_prompt || "Return JSON verification result.",
          user: renderTemplate(template?.user_template || "Question: {{questionJson}}\nEvidence: {{evidence}}\nKnowledgeBounded: {{knowledgeBounded}}", {
            questionJson: JSON.stringify(question),
            evidence: summarizeEvidence(evidencePack),
            knowledgeBounded: String(knowledgeBounded),
          }),
          userId: auth.userId,
          courseId: question.course_id || body.courseId || null,
          requestType: "verify_question",
        });
        if (completion.ok && completion.parsed && typeof completion.parsed === "object") {
          return jsonResponse({
            ...heuristic,
            ...(completion.parsed as Record<string, unknown>),
            modelBased: true,
            heuristicFallback: false,
          }, 200, req);
        }
      }
      return jsonResponse({ ...heuristic, modelBased: false, heuristicFallback: true }, 200, req);
    }

    if (action === "predict_taxonomy") {
      const questionText = String(body.questionText || "");
      const config = await resolveDecryptedProvider(supabase, body.providerId);
      const template = await loadPrompt(supabase, "predict_bloom_difficulty");
      if (!config.demo && config.apiKey && questionText) {
        const completion = await completeAndLog(supabase, config, {
          system: template?.system_prompt || "Classify bloom and difficulty. Return JSON.",
          user: renderTemplate(template?.user_template || "Question text: {{questionText}}\nType: {{questionType}}\nLanguage: {{language}}", {
            questionText,
            questionType: body.questionType || "",
            language: body.language || "th",
          }),
          userId: auth.userId,
          courseId: body.courseId || null,
          requestType: "predict_bloom_difficulty",
        });
        if (completion.ok && completion.parsed && typeof completion.parsed === "object") {
          return jsonResponse({ success: true, ...(completion.parsed as object), modelBased: true }, 200, req);
        }
      }
      return jsonResponse({
        success: true,
        bloomLevel: body.fallbackBloom || "understand",
        difficulty: body.fallbackDifficulty || "medium",
        confidence: 0,
        rationale: "Heuristic fallback — ไม่มีโมเดล",
        modelBased: false,
        heuristicFallback: true,
      }, 200, req);
    }

    if (action === "rubric_retry") {
      const config = await resolveDecryptedProvider(supabase, body.providerId);
      const template = await loadPrompt(supabase, "rubric_retry");
      if (config.demo || !config.apiKey) {
        return jsonResponse({ success: false, error: missingKeyMessage(config), demoMode: true }, 503, req);
      }
      const completion = await completeAndLog(supabase, config, {
        system: template?.system_prompt || "Create rubric JSON.",
        user: renderTemplate(template?.user_template || "Question: {{questionText}}\nMarks: {{marks}}", {
          questionText: body.questionText || "",
          questionType: body.questionType || "essay",
          marks: String(body.marks || 10),
          language: body.language || "th",
        }),
        userId: auth.userId,
        courseId: body.courseId || null,
        requestType: "rubric_retry",
      });
      if (!completion.ok) {
        return jsonResponse({ success: false, error: completion.error, details: completion.details }, completion.status, req);
      }
      const parsed = completion.parsed as Record<string, unknown>;
      return jsonResponse({ success: true, rubric: parsed.rubric || parsed, modelBased: true }, 200, req);
    }

    if (action === "manual_assist") {
      const config = await resolveDecryptedProvider(supabase, body.providerId);
      const template = await loadPrompt(supabase, "manual_assist");
      if (config.demo || !config.apiKey) {
        return jsonResponse({ success: false, demoMode: true, error: missingKeyMessage(config) }, 503, req);
      }
      const completion = await completeAndLog(supabase, config, {
        system: template?.system_prompt || "Help improve a question. Return JSON.",
        user: renderTemplate(template?.user_template || "Action: {{action}}\nCurrent question: {{questionJson}}\nLanguage: {{language}}", {
          action: body.assistAction || "wording",
          questionJson: JSON.stringify(body.question || {}),
          language: body.language || "th",
        }),
        userId: auth.userId,
        courseId: body.courseId || null,
        requestType: "manual_assist",
      });
      if (!completion.ok) {
        return jsonResponse({ success: false, error: completion.error }, completion.status, req);
      }
      return jsonResponse({ success: true, suggestion: completion.parsed, modelBased: true }, 200, req);
    }

    if (action === "get_prompt") {
      const code = String(body.code || "");
      const tpl = await loadPrompt(supabase, code);
      return jsonResponse({ success: true, template: tpl }, 200, req);
    }

    if (action === "process_generation_job") {
      const jobId = String(body.jobId || "");
      if (!jobId) return jsonResponse({ error: "jobId required" }, 400, req);
      const { data: job } = await supabase.from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
      if (!job) return jsonResponse({ error: "Job not found" }, 404, req);
      if (job.status === "completed" || job.status === "failed") {
        return jsonResponse({ success: true, job }, 200, req);
      }
      await updateJob(supabase, jobId, { status: "running", progress_pct: 5, current_stage: "RETRIEVE", started_at: new Date().toISOString() });
      // Worker delegates actual generation to client-orchestrated edge generate;
      // here we mark stages for polling UIs when request_json is present.
      const request = job.request_json || body.request;
      if (!request) {
        await updateJob(supabase, jobId, { status: "failed", error_message: "ไม่มี request_json", progress_pct: 100 });
        return jsonResponse({ success: false, error: "missing request" }, 400, req);
      }
      return jsonResponse({ success: true, accepted: true, jobId, message: "Job marked running — client/orchestrator continues pipeline" }, 200, req);
    }

    if (action === "generate" || action === "orchestrate") {
      const request = body.request || body;
      const providerId = request.providerId as string | null | undefined;
      const config = await resolveDecryptedProvider(supabase, providerId);
      if (config.demo || !config.apiKey) {
        return jsonResponse({
          success: false,
          demoMode: true,
          error: config.reason || missingKeyMessage(config),
        }, 503, req);
      }

      const evidencePack = body.evidencePack;
      const evidenceText = (evidencePack?.retrievedChunks || [])
        .map((c: { content: string }, i: number) => `[#${i + 1}] ${c.content}`)
        .join("\n\n")
        .slice(0, 30000);

      if (request.knowledgeBounded !== false && !evidenceText.trim()) {
        return jsonResponse({
          success: false,
          insufficientEvidence: true,
          status: "INSUFFICIENT_EVIDENCE",
          questions: [],
          error: "INSUFFICIENT_EVIDENCE",
        }, 200, req);
      }

      const genTemplate = await loadPrompt(supabase, "question_generation") ;
      const includeRubric = request.includeRubric === true
        || request.questionType === "essay"
        || request.questionType === "case_study";
      const rubricInstruction = includeRubric
        ? `For every essay or case_study question you MUST include a "rubric" object with totalMarks=${request.marksPerQuestion} and criteria[]. Each criterion needs criterion, description, maxMarks, performanceLevels[{level,description,marksRange}] using Thai levels ดีเยี่ยม/ดี/พอใช้/ต้องปรับปรุง. Criterion maxMarks must sum to ${request.marksPerQuestion}. Do NOT omit rubric.`
        : "Rubric is optional except when the question is essay/case_study.";
      const system = genTemplate?.system_prompt
        || `You are an expert educational assessment designer. Use ONLY provided evidence. Return JSON {"questions":[...]} with fields questionText,questionType,language,choices,correctAnswer,explanation,bloomLevel,difficulty,learningOutcomeCodes,topic,tags,marks,estimatedAnswerTimeMinutes,sourceReference,qualityFlags,rubric. ${rubricInstruction} If evidence insufficient return {"status":"INSUFFICIENT_EVIDENCE","questions":[]}.`;
      const user = genTemplate?.user_template
        ? renderTemplate(genTemplate.user_template, {
          numberOfQuestions: String(request.numberOfQuestions),
          language: request.language,
          questionType: request.questionType,
          bloomLevel: request.bloomLevel,
          difficulty: request.difficulty,
          marks: String(request.marksPerQuestion),
          clo: (request.learningOutcomeCodes || []).join(", "),
          mode: request.mode,
          evidence: evidenceText || "(none)",
        })
        : `Create ${request.numberOfQuestions} ${request.language} questions.
Type=${request.questionType} Bloom=${request.bloomLevel} Difficulty=${request.difficulty} Marks=${request.marksPerQuestion} includeRubric=${includeRubric}
CLO=${(request.learningOutcomeCodes || []).join(", ")}
Mode=${request.mode}
Evidence:\n${evidenceText || "(none)"}`;

      const completion = await completeAndLog(supabase, config, {
        system,
        user,
        userId: request.createdBy || auth.userId,
        courseId: request.courseId,
        requestType: "question_generation_v2",
      });
      if (!completion.ok) {
        return jsonResponse({
          success: false,
          error: completion.error,
          details: completion.details,
          demoMode: completion.demo,
          usageLogged: true,
        }, completion.status, req);
      }

      const parsed = (completion.parsed && typeof completion.parsed === "object")
        ? completion.parsed as Record<string, unknown>
        : {};
      if (parsed.status === "INSUFFICIENT_EVIDENCE") {
        return jsonResponse({ success: false, insufficientEvidence: true, status: "INSUFFICIENT_EVIDENCE", questions: [], usageLogged: true }, 200, req);
      }
      let questions = completion.questions as Record<string, unknown>[];
      const model = completion.model;
      if (!questions.length) {
        return jsonResponse({ success: false, error: "AI returned no valid questions", usageLogged: true }, 500, req);
      }

      // #20 Rubric retry instead of static fallback
      if (includeRubric) {
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const qType = String(q.questionType || request.questionType);
          if ((qType === "essay" || qType === "case_study") && !q.rubric) {
            const retry = await completeAndLog(supabase, config, {
              system: (await loadPrompt(supabase, "rubric_retry"))?.system_prompt || "Create rubric JSON {\"rubric\":{...}}",
              user: `Question: ${q.questionText}\nType: ${qType}\nMarks: ${q.marks || request.marksPerQuestion}\nLanguage: ${request.language}`,
              userId: request.createdBy || auth.userId,
              courseId: request.courseId,
              requestType: "rubric_retry",
            });
            if (retry.ok && retry.parsed && typeof retry.parsed === "object") {
              const rp = retry.parsed as Record<string, unknown>;
              q.rubric = rp.rubric || rp;
            }
          }
        }
      }

      // #17 Predict bloom/difficulty when model omitted distinct predictions
      for (const q of questions) {
        if (!q.predictedBloomLevel && !q.aiPredictedBloomLevel) {
          const pred = await completeAndLog(supabase, config, {
            system: (await loadPrompt(supabase, "predict_bloom_difficulty"))?.system_prompt
              || "Return JSON {bloomLevel,difficulty,confidence,rationale}",
            user: `Question text: ${q.questionText}\nType: ${q.questionType || request.questionType}\nLanguage: ${request.language}`,
            userId: request.createdBy || auth.userId,
            courseId: request.courseId,
            requestType: "predict_bloom_difficulty",
          }).catch(() => null);
          if (pred && pred.ok && pred.parsed && typeof pred.parsed === "object") {
            const p = pred.parsed as Record<string, unknown>;
            q.predictedBloomLevel = p.bloomLevel;
            q.predictedDifficulty = p.difficulty;
          }
        }
      }

      const rows = questions.map((q: Record<string, unknown>) => {
        const qType = String(q.questionType || request.questionType);
        const marks = Number(q.marks || request.marksPerQuestion);
        return {
          course_id: request.courseId,
          question_text: q.questionText || "",
          question_type: qType,
          language: q.language || request.language,
          choices: q.choices || null,
          correct_answer: typeof q.correctAnswer === "string" ? q.correctAnswer : JSON.stringify(q.correctAnswer ?? ""),
          explanation: q.explanation || "",
          intended_bloom_level: q.bloomLevel || request.bloomLevel,
          ai_predicted_bloom_level: q.predictedBloomLevel || q.aiPredictedBloomLevel || q.bloomLevel || request.bloomLevel,
          intended_difficulty: q.difficulty || request.difficulty,
          ai_predicted_difficulty: q.predictedDifficulty || q.aiPredictedDifficulty || q.difficulty || request.difficulty,
          marks,
          estimated_answer_time_minutes: q.estimatedAnswerTimeMinutes || 2,
          source_references: q.sourceReference ? [{ document_id: null, file_name: null, page: 1, section: q.sourceReference, quote: null }] : null,
          learning_outcome_codes: q.learningOutcomeCodes || request.learningOutcomeCodes || [],
          quality_flags: q.qualityFlags || [],
          topic: q.topic || null,
          tags: Array.isArray(q.tags) ? q.tags : [],
          rubric: q.rubric || null,
          status: "ready_for_review",
          source_type: "ai_generated",
          generated_by_ai: true,
          ai_model: model,
          created_by: request.createdBy || auth.userId,
          generation_mode: request.mode || "ai",
        };
      });

      const { data: savedQuestions, error: insertError } = await supabase.from("questions").insert(rows).select();
      const usage = {
        provider: completion.providerType,
        inputTokens: completion.usage.inputTokens,
        outputTokens: completion.usage.outputTokens,
        totalTokens: completion.usage.totalTokens,
        model,
        latencyMs: completion.usage.latencyMs,
        estimatedCostUsd: completion.usage.estimatedCostUsd,
      };

      return jsonResponse({
        success: true,
        status: "completed",
        mode: request.mode || "ai",
        executionId: `exec-edge-${Date.now()}`,
        questions,
        savedQuestions: savedQuestions || [],
        insertError: insertError?.message || null,
        usageLogged: true,
        usage,
      }, 200, req);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400, req);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, req);
  }
});

async function resolveDecryptedProvider(supabase: SupabaseAdmin, providerId?: string | null, overrideKey?: string) {
  const row = await fetchProviderRow(supabase, providerId);
  if (row?.encrypted_api_key && !overrideKey) {
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
  return resolveRequestProvider(supabase, providerId, overrideKey);
}

async function resolveEmbeddingProvider(supabase: SupabaseAdmin, providerId?: string | null) {
  const preferred = providerId
    ? await resolveDecryptedProvider(supabase, providerId)
    : null;
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
  // Env-only fallback
  const env = readAiEnv();
  if (env.OPENAI_API_KEY) {
    return resolveProviderConfig({
      provider: { provider_type: "openai", embedding_model: "text-embedding-3-small", generation_model: "gpt-4o" } as ProviderRow,
      env,
    });
  }
  if (env.GEMINI_API_KEY) {
    return resolveProviderConfig({
      provider: { provider_type: "gemini", embedding_model: "text-embedding-004", generation_model: "gemini-1.5-flash" } as ProviderRow,
      env,
    });
  }
  return null;
}

async function loadPrompt(supabase: SupabaseAdmin, code: string) {
  const { data } = await supabase.from("prompt_templates").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  return data as { system_prompt?: string; user_template?: string; code?: string } | null;
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function lexicalScore(query: string, content: string): number {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const c = content.toLowerCase();
  if (!q.length) return 0;
  let hit = 0;
  for (const w of q) if (c.includes(w)) hit++;
  return hit / q.length;
}

function summarizeEvidence(evidencePack: { retrievedChunks?: Array<{ content: string }> }) {
  return (evidencePack?.retrievedChunks || []).slice(0, 6).map((c, i) => `[#${i + 1}] ${c.content}`).join("\n").slice(0, 12000);
}

function heuristicAnalyze(request: Record<string, unknown>, evidence: { retrievedChunks?: unknown[]; retrievalConfidence?: number; coverageScore?: number }) {
  const chunks = evidence?.retrievedChunks?.length || 0;
  const insufficient = request.knowledgeBounded !== false && request.mode !== "manual" && chunks === 0;
  return {
    decision: insufficient ? "reject" : (Number(evidence?.coverageScore || 0) < 0.3 ? "revise" : "approve"),
    reason: insufficient
      ? ["INSUFFICIENT_EVIDENCE: ไม่พบเนื้อหาเพียงพอจากเอกสารที่เลือก"]
      : ["Heuristic analysis — detailed model analysis unavailable"],
    coverage: {
      documents: Array.isArray(request.documentIds) && request.documentIds.length ? 1 : 0,
      chunks: Math.min(1, chunks / 5),
      retrieval: Number(evidence?.retrievalConfidence || 0),
      overall: Number(evidence?.coverageScore || 0),
    },
    recommendedQuestionTypes: [request.questionType].filter(Boolean),
    recommendedBloomLevels: [request.bloomLevel].filter(Boolean),
    recommendedDifficulty: [request.difficulty].filter(Boolean),
    generationPlan: [],
    insufficientEvidence: insufficient,
  };
}

function heuristicVerify(question: Record<string, unknown>, evidence: { retrievedChunks?: unknown[] }, knowledgeBounded: boolean) {
  const checks = [];
  const violations: string[] = [];
  if (!String(question.question_text || question.questionText || "").trim()) {
    checks.push({ code: "HAS_TEXT", name: "มีข้อความคำถาม", status: "fail", message: "ไม่มีข้อความคำถาม" });
    violations.push("missing_question_text");
  } else {
    checks.push({ code: "HAS_TEXT", name: "มีข้อความคำถาม", status: "pass", message: "OK" });
  }
  if (knowledgeBounded && !(evidence?.retrievedChunks?.length) && !(question.source_references as unknown[])?.length) {
    checks.push({ code: "GROUNDED", name: "อิงหลักฐาน", status: "fail", message: "INSUFFICIENT_EVIDENCE" });
    violations.push("insufficient_evidence");
  }
  const status = violations.length ? "fail" : "pass";
  return {
    status,
    score: status === "pass" ? 80 : 40,
    checks,
    violations,
    recommendations: ["Heuristic verification — model verify unavailable"],
    dimensions: {
      grounding: knowledgeBounded ? (violations.includes("insufficient_evidence") ? 20 : 70) : 70,
      correctness: 70,
      clarity: 70,
      clo_alignment: 70,
      bloom_alignment: 70,
      difficulty_alignment: 70,
      distractor_quality: 70,
      language_quality: 70,
      traceability: 50,
    },
  };
}

async function updateJob(supabase: SupabaseAdmin, jobId: string, patch: Record<string, unknown>) {
  await supabase.from("generation_jobs").update(patch).eq("id", jobId);
}

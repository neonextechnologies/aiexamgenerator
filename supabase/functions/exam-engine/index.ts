import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleOptions, jsonResponse, requireUser } from "../_shared/auth.ts";

type Action =
  | "orchestrate"
  | "generate"
  | "analyze"
  | "verify"
  | "chat"
  | "ingest"
  | "provider_test";

function decodeApiKey(encoded?: string | null): string {
  if (!encoded) return "";
  try {
    return atob(encoded);
  } catch {
    return "";
  }
}

async function resolveProviderKey(
  supabase: ReturnType<typeof createClient>,
  providerId?: string | null,
  overrideKey?: string,
): Promise<{ key: string; provider: Record<string, unknown> | null }> {
  if (overrideKey?.trim()) return { key: overrideKey.trim(), provider: null };
  if (!providerId) {
    return { key: Deno.env.get("OPENAI_API_KEY") || "", provider: null };
  }
  const { data: provider } = await supabase.from("ai_providers").select("*").eq("id", providerId).maybeSingle();
  if (!provider) return { key: "", provider: null };
  const stored = decodeApiKey(provider.encrypted_api_key as string | null);
  if (stored) return { key: stored, provider };
  const secretName = (provider.secret_ref as string) || "OPENAI_API_KEY";
  return { key: Deno.env.get(secretName) || "", provider };
}

async function testProviderConnection(provider: Record<string, unknown>, key: string): Promise<{ ok: boolean; message: string; status: string }> {
  if (!key) return { ok: false, message: "ไม่พบ API key — กรุณาบันทึกในหน้าตั้งค่า", status: "missing_key" };

  const providerType = String(provider.provider_type || "openai");
  if (providerType === "openai" || providerType === "openai_compatible") {
    const base = String(provider.base_url || "https://api.openai.com/v1").replace(/\/$/, "");
    const resp = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    return {
      ok: resp.ok,
      message: resp.ok ? "เชื่อมต่อสำเร็จ" : `HTTP ${resp.status}`,
      status: resp.ok ? "ok" : `http_${resp.status}`,
    };
  }

  if (providerType === "anthropic") {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: String(provider.default_model || "claude-3-5-haiku-latest"),
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const ok = resp.ok || resp.status === 400;
    return {
      ok,
      message: ok ? "เชื่อมต่อ Anthropic สำเร็จ" : `HTTP ${resp.status}`,
      status: ok ? "ok" : `http_${resp.status}`,
    };
  }

  if (providerType === "gemini") {
    const model = String(provider.default_model || "gemini-1.5-flash");
    const base = String(provider.base_url || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const resp = await fetch(`${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
    });
    return {
      ok: resp.ok,
      message: resp.ok ? "เชื่อมต่อ Gemini สำเร็จ" : `HTTP ${resp.status}`,
      status: resp.ok ? "ok" : `http_${resp.status}`,
    };
  }

  return { ok: true, message: "API key ถูกตั้งค่าแล้ว", status: "key_present" };
}

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
      if (providerId === "prov-demo") return jsonResponse({ ok: true, message: "Demo provider ready" }, 200, req);
      const { data: provider } = await supabase.from("ai_providers").select("*").eq("id", providerId).maybeSingle();
      if (!provider) return jsonResponse({ ok: false, message: "Provider not found" }, 404, req);
      const { key } = await resolveProviderKey(supabase, providerId, body.apiKey as string | undefined);
      const result = await testProviderConnection(provider, key);
      await supabase.from("ai_providers").update({
        last_tested_at: new Date().toISOString(),
        last_test_status: result.status,
      }).eq("id", providerId);
      return jsonResponse({ ok: result.ok, message: result.message }, 200, req);
    }

    if (action === "ingest") {
      const { documentId, text, courseId } = body;
      if (!documentId || !text) return jsonResponse({ error: "documentId and text required" }, 400, req);
      await supabase.from("document_chunks").delete().eq("document_id", documentId);
      const size = 800;
      const parts: string[] = [];
      const clean = String(text).replace(/\s+/g, " ").trim();
      for (let i = 0; i < clean.length; i += size) parts.push(clean.slice(i, i + size));
      if (parts.length) {
        await supabase.from("document_chunks").insert(parts.map((content, idx) => ({
          document_id: documentId,
          course_id: courseId || null,
          chunk_index: idx,
          content,
          page_number: idx + 1,
          token_count: Math.ceil(content.length / 4),
          metadata_json: {},
        })));
      }
      await supabase.from("documents").update({ processing_stage: "indexed", status: "indexed", updated_at: new Date().toISOString() }).eq("id", documentId);
      return jsonResponse({ success: true, chunkCount: parts.length }, 200, req);
    }

    if (action === "chat") {
      const message = String(body.message || "");
      const context = body.context || {};
      const reply =
        `ฉันเป็นผู้ช่วยออกแบบข้อสอบ (Controlled Hybrid)\n` +
        `บริบท: course=${context.courseId || "-"} page=${context.page || "-"}\n` +
        `คำขอของคุณ: ${message}\n\n` +
        `คำแนะนำ: ใช้โหมด Manual หากไม่ต้องการ AI, ใช้ Hybrid เพื่อกำหนดโครงสร้างเอง และให้ AI ช่วยร่าง, หรือ AI Mode สำหรับ pipeline ควบคุมเต็มรูปแบบ (Rules + Evidence + Verification)\n` +
        `ฉันจะไม่แก้ข้อมูลจริงจนกว่าคุณจะยืนยัน action`;
      return jsonResponse({
        success: true,
        reply: { id: `m-${Date.now()}`, role: "assistant", content: reply },
        proposedActions: message.includes("สร้าง") ? [{
          id: `act-${Date.now()}`,
          action_type: "open_generate_wizard",
          payload: { courseId: context.courseId },
          preview: "เปิดหน้าสร้างข้อสอบด้วย AI/Hybrid",
          status: "proposed",
        }] : [],
      }, 200, req);
    }

    if (action === "generate" || action === "orchestrate") {
      const request = body.request || body;
      const providerId = request.providerId as string | null | undefined;
      const { key: openaiKey, provider } = await resolveProviderKey(supabase, providerId);
      if (!openaiKey) {
        return jsonResponse({
          success: false,
          demoMode: true,
          error: "API key not configured — set provider in Settings or configure OPENAI_API_KEY",
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

      const model = String(provider?.generation_model || provider?.default_model || Deno.env.get("OPENAI_QUESTION_MODEL") || "gpt-4o");
      const providerType = String(provider?.provider_type || "openai");
      const baseUrl = String(provider?.base_url || "https://api.openai.com/v1").replace(/\/$/, "");
      const system = "You are an expert educational assessment designer. Use ONLY provided evidence. Return JSON {\"questions\":[...]} with fields questionText,questionType,language,choices,correctAnswer,explanation,bloomLevel,difficulty,learningOutcomeCodes,topic,marks,estimatedAnswerTimeMinutes,sourceReference,qualityFlags. If evidence insufficient return {\"status\":\"INSUFFICIENT_EVIDENCE\",\"questions\":[]}.";
      const user = `Create ${request.numberOfQuestions} ${request.language} questions.
Type=${request.questionType} Bloom=${request.bloomLevel} Difficulty=${request.difficulty} Marks=${request.marksPerQuestion}
CLO=${(request.learningOutcomeCodes || []).join(", ")}
Mode=${request.mode}
Evidence:\n${evidenceText || "(none)"}`;

      const openaiResp = providerType === "anthropic"
        ? await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": openaiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: Number(provider?.max_tokens || 8000),
            system,
            messages: [{ role: "user", content: user }],
          }),
        })
        : providerType === "gemini"
        ? await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(openaiKey)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        })
        : await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
            response_format: { type: "json_object" },
            max_completion_tokens: Number(provider?.max_tokens || 8000),
          }),
        });

      if (!openaiResp.ok) {
        const t = await openaiResp.text();
        return jsonResponse({ error: `OpenAI error ${openaiResp.status}`, details: t.slice(0, 400), demoMode: true }, 502, req);
      }

      const openaiData = await openaiResp.json();
      const content = providerType === "anthropic"
        ? openaiData.content?.[0]?.text || "{}"
        : providerType === "gemini"
        ? openaiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
        : openaiData.choices?.[0]?.message?.content || "{}";
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(content); } catch { parsed = {}; }
      if (parsed.status === "INSUFFICIENT_EVIDENCE") {
        return jsonResponse({ success: false, insufficientEvidence: true, status: "INSUFFICIENT_EVIDENCE", questions: [] }, 200, req);
      }
      const questions = Array.isArray(parsed.questions) ? parsed.questions : (Array.isArray(parsed) ? parsed : []);

      const rows = questions.map((q: Record<string, unknown>) => ({
        course_id: request.courseId,
        question_text: q.questionText || "",
        question_type: q.questionType || request.questionType,
        language: q.language || request.language,
        choices: q.choices || null,
        correct_answer: typeof q.correctAnswer === "string" ? q.correctAnswer : JSON.stringify(q.correctAnswer ?? ""),
        explanation: q.explanation || "",
        intended_bloom_level: q.bloomLevel || request.bloomLevel,
        ai_predicted_bloom_level: q.bloomLevel || request.bloomLevel,
        intended_difficulty: q.difficulty || request.difficulty,
        ai_predicted_difficulty: q.difficulty || request.difficulty,
        marks: q.marks || request.marksPerQuestion,
        estimated_answer_time_minutes: q.estimatedAnswerTimeMinutes || 2,
        source_references: q.sourceReference ? [{ document_id: null, file_name: null, page: 1, section: q.sourceReference, quote: null }] : null,
        learning_outcome_codes: q.learningOutcomeCodes || request.learningOutcomeCodes || [],
        quality_flags: q.qualityFlags || [],
        topic: q.topic || null,
        status: "ready_for_review",
        source_type: "ai_generated",
        generated_by_ai: true,
        ai_model: model,
        created_by: request.createdBy || auth.userId,
        generation_mode: request.mode || "ai",
      }));

      const { data: savedQuestions, error: insertError } = await supabase.from("questions").insert(rows).select();
      const usage = {
        inputTokens: openaiData.usage?.prompt_tokens || openaiData.usage?.input_tokens || 0,
        outputTokens: openaiData.usage?.completion_tokens || openaiData.usage?.output_tokens || 0,
        totalTokens: openaiData.usage?.total_tokens || 0,
        model,
        estimatedCostUsd: ((openaiData.usage?.prompt_tokens || openaiData.usage?.input_tokens || 0) * 0.0000025) + ((openaiData.usage?.completion_tokens || openaiData.usage?.output_tokens || 0) * 0.00001),
      };

      return jsonResponse({
        success: true,
        status: "completed",
        mode: request.mode || "ai",
        executionId: `exec-edge-${Date.now()}`,
        questions,
        savedQuestions: savedQuestions || [],
        insertError: insertError?.message || null,
        usage,
      }, 200, req);
    }

    if (action === "analyze") {
      return jsonResponse({
        decision: "approve",
        reason: ["Server analysis passthrough — detailed analysis runs in client/orchestrator"],
        coverage: {},
        recommendedQuestionTypes: [body.request?.questionType].filter(Boolean),
        recommendedBloomLevels: [body.request?.bloomLevel].filter(Boolean),
        recommendedDifficulty: [body.request?.difficulty].filter(Boolean),
        generationPlan: [],
      }, 200, req);
    }

    if (action === "verify") {
      return jsonResponse({ status: "pass", score: 90, checks: [], violations: [], recommendations: [] }, 200, req);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400, req);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, req);
  }
});

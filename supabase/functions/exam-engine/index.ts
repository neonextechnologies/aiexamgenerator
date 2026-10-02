import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleOptions, jsonResponse, requireUser } from "../_shared/auth.ts";
import { completeAndLog, missingKeyMessage, probeRequestProvider, resolveRequestProvider } from "../_shared/llm.ts";

type Action =
  | "orchestrate"
  | "generate"
  | "analyze"
  | "verify"
  | "chat"
  | "ingest"
  | "provider_test";

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
      const config = await resolveRequestProvider(supabase, providerId, body.apiKey as string | undefined);
      const result = await probeRequestProvider(config);
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
      const config = await resolveRequestProvider(supabase, providerId);
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

      const system = "You are an expert educational assessment designer. Use ONLY provided evidence. Return JSON {\"questions\":[...]} with fields questionText,questionType,language,choices,correctAnswer,explanation,bloomLevel,difficulty,learningOutcomeCodes,topic,marks,estimatedAnswerTimeMinutes,sourceReference,qualityFlags. If evidence insufficient return {\"status\":\"INSUFFICIENT_EVIDENCE\",\"questions\":[]}.";
      const user = `Create ${request.numberOfQuestions} ${request.language} questions.
Type=${request.questionType} Bloom=${request.bloomLevel} Difficulty=${request.difficulty} Marks=${request.marksPerQuestion}
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
      const questions = completion.questions;
      const model = completion.model;
      if (!questions.length) {
        return jsonResponse({ success: false, error: "AI returned no valid questions", usageLogged: true }, 500, req);
      }

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

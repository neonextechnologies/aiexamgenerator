import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerationRequest {
  courseId: string;
  documentTexts: { fileName: string; text: string }[];
  learningOutcomeCodes: string[];
  questionType: string;
  bloomLevel: string;
  difficulty: string;
  numberOfQuestions: number;
  language: string;
  marksPerQuestion: number;
  includeExplanation: boolean;
  includeRubric: boolean;
  createdBy: string;
}

const BLOOM_THAI: Record<string, string> = {
  remember: "จำ (Remember)",
  understand: "เข้าใจ (Understand)",
  apply: "ประยุกต์ใช้ (Apply)",
  analyze: "วิเคราะห์ (Analyze)",
  evaluate: "ประเมินค่า (Evaluate)",
  create: "สร้างสรรค์ (Create)",
};

const DIFFICULTY_THAI: Record<string, string> = {
  easy: "ง่าย (Easy)",
  medium: "ปานกลาง (Medium)",
  hard: "ยาก (Hard)",
  advanced: "ขั้นสูง (Advanced)",
};

const QUESTION_TYPE_THAI: Record<string, string> = {
  multiple_choice_single: "ปรนัยเลือกคำตอบเดียว (Multiple Choice - Single Answer)",
  multiple_choice_multiple: "ปรนัยเลือกหลายคำตอบ (Multiple Choice - Multiple Answers)",
  true_false: "ถูกหรือผิด (True/False)",
  short_answer: "คำตอบสั้น (Short Answer)",
  essay: "อัตนัย (Essay)",
  case_study: "กรณีศึกษา (Case Study)",
  fill_in_blank: "เติมคำ (Fill in the Blank)",
};

function buildPrompt(req: GenerationRequest): string {
  const bloomLabel = BLOOM_THAI[req.bloomLevel] || req.bloomLevel;
  const diffLabel = DIFFICULTY_THAI[req.difficulty] || req.difficulty;
  const qTypeLabel = QUESTION_TYPE_THAI[req.questionType] || req.questionType;
  const langLabel = req.language === "th" ? "ภาษาไทย" : "English";

  const maxContext = 30000;
  let combinedText = "";
  for (const doc of req.documentTexts) {
    if (!doc.text) continue;
    combinedText += `\n--- ${doc.fileName} ---\n${doc.text}\n`;
    if (combinedText.length > maxContext) break;
  }
  combinedText = combinedText.slice(0, maxContext);

  const cloList = req.learningOutcomeCodes.length > 0
    ? req.learningOutcomeCodes.join(", ")
    : "ไม่ระบุ (ใช้เนื้อหาเป็นฐาน)";

  const isMCQ = req.questionType === "multiple_choice_single" || req.questionType === "multiple_choice_multiple";
  const isEssay = req.questionType === "essay" || req.questionType === "case_study";

  let schemaInstructions = "";
  if (isMCQ) {
    schemaInstructions = `Each question MUST have exactly 4 choices (a, b, c, d) with exactly one correct answer for single-answer type. Each choice must have a "rationale" field explaining why it is correct or incorrect.`;
  } else if (req.questionType === "true_false") {
    schemaInstructions = `Each question is a statement. The correctAnswer must be "true" or "false".`;
  } else if (isEssay) {
    schemaInstructions = `Each question must include a "rubric" with criteria, each having maxMarks and performance levels (ดีเยี่ยม, ดี, พอใช้, ต้องปรับปรุง). The total rubric marks must equal ${req.marksPerQuestion * req.numberOfQuestions / req.numberOfQuestions}.`;
  } else {
    schemaInstructions = `Provide a clear correct answer and explanation.`;
  }

  return `You are an expert educational assessment designer specializing in creating high-quality exam questions for Thai higher education.

TASK: Create ${req.numberOfQuestions} exam questions in ${langLabel} based on the provided course materials.

REQUIREMENTS:
- Question type: ${qTypeLabel}
- Bloom's Taxonomy level: ${bloomLabel}
- Difficulty: ${diffLabel}
- Marks per question: ${req.marksPerQuestion}
- Language: ${langLabel}
- Learning Outcomes (CLO): ${cloList}
- ${schemaInstructions}
- Each question must be grounded in the provided source material
- Questions must be clear, unambiguous, and academically rigorous
- Distractors must be plausible and educationally meaningful
- Explanations must clearly justify the correct answer
- Avoid biased, culturally insensitive, or misleading content

SOURCE MATERIALS:
${combinedText}

${req.includeRubric ? "For essay/case study questions, include a detailed rubric with criteria and performance levels." : ""}

Return a JSON array of ${req.numberOfQuestions} question objects. Each object must have this exact structure:
{
  "questionText": "the question text in ${langLabel}",
  "questionType": "${req.questionType}",
  "language": "${req.language}",
  ${isMCQ ? `"choices": [{"id":"a","text":"choice text","isCorrect":true,"rationale":"why correct"},{"id":"b","text":"choice text","isCorrect":false,"rationale":"why incorrect"},{"id":"c","text":"choice text","isCorrect":false,"rationale":"why incorrect"},{"id":"d","text":"choice text","isCorrect":false,"rationale":"why incorrect"}],
  "correctAnswer": "a",` : `"correctAnswer": "${req.questionType === "true_false" ? "true or false" : "the answer"}",`}
  "explanation": "detailed explanation in ${langLabel}",
  "bloomLevel": "${req.bloomLevel}",
  "difficulty": "${req.difficulty}",
  "learningOutcomeCodes": ${JSON.stringify(req.learningOutcomeCodes)},
  "topic": "the topic from source material",
  "marks": ${req.marksPerQuestion},
  "estimatedAnswerTimeMinutes": ${req.difficulty === "easy" ? 1 : req.difficulty === "medium" ? 2 : req.difficulty === "hard" ? 3 : 5},
  "sourceReference": "which document and section this question is based on",
  ${isEssay && req.includeRubric ? `"rubric": {"totalMarks": ${req.marksPerQuestion}, "criteria": [{"criterion": "name", "description": "desc", "maxMarks": number, "performanceLevels": [{"level": "ดีเยี่ยม", "description": "desc", "marksRange": "range"}]}]},` : ""}
  "qualityFlags": []
}

Return ONLY the JSON array, no other text.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: GenerationRequest = await req.json();

    if (!body.courseId || !body.numberOfQuestions) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured. Set OPENAI_API_KEY in Supabase secrets to use real AI generation.",
          demoMode: true,
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = Deno.env.get("OPENAI_QUESTION_MODEL") || "gpt-4o";
    const maxTokens = parseInt(Deno.env.get("AI_MAX_OUTPUT_TOKENS") || "8000");
    const isReasoningModel = /^o[134]/.test(model);

    const prompt = buildPrompt(body);
    const startTime = Date.now();

    const messages = isReasoningModel
      ? [{ role: "user", content: `You are an expert educational assessment designer. You create high-quality, academically rigorous exam questions. Always return valid JSON.\n\n${prompt}` }]
      : [
          { role: "system", content: "You are an expert educational assessment designer. You create high-quality, academically rigorous exam questions. Always return valid JSON." },
          { role: "user", content: prompt },
        ];

    const buildOpenaiBody = () => JSON.stringify({
      model,
      messages,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    });

    const orgId = Deno.env.get("OPENAI_ORGANIZATION_ID");
    const projectId = Deno.env.get("OPENAI_PROJECT_ID");
    const baseHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${openaiApiKey}` };
    const headersWithOrg = { ...baseHeaders, ...(orgId && { "OpenAI-Organization": orgId }), ...(projectId && { "OpenAI-Project": projectId }) };

    let openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: headersWithOrg, body: buildOpenaiBody(),
    });

    if (!openaiResponse.ok && openaiResponse.status === 401 && (orgId || projectId)) {
      openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: baseHeaders, body: buildOpenaiBody(),
      });
    }

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${openaiResponse.status}`, details: errorText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const latencyMs = Date.now() - startTime;

    let content = openaiData.choices?.[0]?.message?.content || "";
    let questions: any[] = [];

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) questions = parsed;
      else if (parsed.questions && Array.isArray(parsed.questions)) questions = parsed.questions;
      else if (Object.keys(parsed).length > 0 && parsed.questionText) questions = [parsed];
    } catch {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try { questions = JSON.parse(jsonMatch[0]); }
        catch { return new Response(JSON.stringify({ error: "Failed to parse AI response as JSON" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
      }
    }

    if (questions.length === 0) {
      return new Response(JSON.stringify({ error: "AI returned no valid questions" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const questionsToInsert = questions.map((q: any) => ({
      course_id: body.courseId,
      question_text: q.questionText || "",
      question_type: q.questionType || body.questionType,
      language: q.language || body.language,
      choices: q.choices || null,
      correct_answer: typeof q.correctAnswer === "string" ? q.correctAnswer : JSON.stringify(q.correctAnswer),
      explanation: q.explanation || "",
      intended_bloom_level: q.bloomLevel || body.bloomLevel,
      ai_predicted_bloom_level: q.bloomLevel || body.bloomLevel,
      intended_difficulty: q.difficulty || body.difficulty,
      ai_predicted_difficulty: q.difficulty || body.difficulty,
      marks: q.marks || body.marksPerQuestion,
      estimated_answer_time_minutes: q.estimatedAnswerTimeMinutes || (body.difficulty === "easy" ? 1 : body.difficulty === "medium" ? 2 : body.difficulty === "hard" ? 3 : 5),
      source_references: q.sourceReference ? [{ document_id: null, file_name: null, page: 1, section: q.sourceReference, quote: null }] : (q.sourceReferences || null),
      rubric: q.rubric || null,
      learning_outcome_codes: q.learningOutcomeCodes || body.learningOutcomeCodes,
      quality_flags: q.qualityFlags || [],
      quality_score: q.qualityScore || null,
      topic: q.topic || null,
      status: "ai_generated",
      source_type: "ai_generated",
      generated_by_ai: true,
      ai_model: model,
      created_by: body.createdBy || "ai",
    }));

    const { data: insertedQuestions, error: insertError } = await supabase
      .from("questions")
      .insert(questionsToInsert)
      .select();

    const inputTokens = openaiData.usage?.prompt_tokens || 0;
    const outputTokens = openaiData.usage?.completion_tokens || 0;
    const totalTokens = openaiData.usage?.total_tokens || 0;

    return new Response(
      JSON.stringify({
        success: true,
        questions: questions,
        savedQuestions: insertedQuestions || [],
        insertError: insertError?.message || null,
        usage: { inputTokens, outputTokens, totalTokens, model, latencyMs, estimatedCostUsd: ((inputTokens * 0.0000025) + (outputTokens * 0.00001)) },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

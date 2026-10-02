import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleOptions, jsonResponse, requireUser } from "../_shared/auth.ts";
import { completeAndLog, resolveRequestProvider } from "../_shared/llm.ts";

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

Return ONLY a JSON object of the form {"questions":[ ...exactly ${req.numberOfQuestions} question objects... ]}. No other text.`;
}

Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body: GenerationRequest = await req.json();
    if (!body.createdBy) body.createdBy = auth.userId;

    if (!body.courseId || !body.numberOfQuestions) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const providerId = (body as GenerationRequest & { providerId?: string }).providerId;
    const config = await resolveRequestProvider(supabase, providerId);
    const prompt = buildPrompt(body);
    const completion = await completeAndLog(supabase, config, {
      system: "You are an expert educational assessment designer. You create high-quality, academically rigorous exam questions. Always return a JSON object with a questions array.",
      user: prompt,
      userId: body.createdBy || auth.userId,
      courseId: body.courseId,
      requestType: "question_generation",
    });

    if (!completion.ok) {
      return jsonResponse({
        error: completion.error,
        details: completion.details,
        demoMode: completion.demo,
      }, completion.status);
    }

    const questions = completion.questions as Array<Record<string, unknown>>;
    const model = completion.model;
    const latencyMs = completion.usage.latencyMs;

    if (questions.length === 0) {
      return jsonResponse({ error: "AI returned no valid questions", usageLogged: true }, 500);
    }

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

    return jsonResponse({
      success: true,
      questions: questions,
      savedQuestions: insertedQuestions || [],
      insertError: insertError?.message || null,
      usageLogged: true,
      usage: {
        provider: completion.providerType,
        inputTokens: completion.usage.inputTokens,
        outputTokens: completion.usage.outputTokens,
        totalTokens: completion.usage.totalTokens,
        model,
        latencyMs,
        estimatedCostUsd: completion.usage.estimatedCostUsd,
      },
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});

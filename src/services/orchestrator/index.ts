import type { GenerationV2Request, GenerationV2Result, AIProviderConfig, QuestionTypeDef, DifficultyDefinition, GenerationMode } from '../../types/v2';
import type { AIOrchestrator, GenerationProgressUpdate } from '../types';
import { isDemoMode, supabase } from '../../lib/supabase';
import { invokeEdgeFunction } from '../../lib/edge';
import { knowledgeProvider } from '../knowledge';
import { ruleEngine } from '../rules';
import { verificationEngine } from '../verification';
import { analysisEngine } from '../workflows/analysis';
import { workflowEngine } from '../workflows';
import { DemoAIProvider } from '../../lib/ai-provider';
import { insertQuestions, createGenerationJob, updateGenerationJob, getGenerationJob, createUsageLog, createNotification, listQuestions } from '../../lib/api';
import type { GenerationJob, Question } from '../../types';
import { contentHashForQuestion } from '../duplicates';
import { ensureRubricForQuestion, normalizeRubric } from '../rubric';
import { aiProviderService } from '../ai-providers';

const DEMO_PROVIDERS: AIProviderConfig[] = [
  { id: 'prov-demo', name: 'Demo Provider', provider_type: 'demo', is_enabled: true, default_model: 'demo-model', generation_model: 'demo-model' },
  { id: 'prov-openai', name: 'OpenAI', provider_type: 'openai', is_enabled: false, default_model: 'gpt-4o', generation_model: 'gpt-4o', secret_ref: 'OPENAI_API_KEY' },
  { id: 'prov-gemini', name: 'Google Gemini', provider_type: 'gemini', is_enabled: false, default_model: 'gemini-1.5-pro', secret_ref: 'GEMINI_API_KEY' },
  { id: 'prov-anthropic', name: 'Anthropic Claude', provider_type: 'anthropic', is_enabled: false, default_model: 'claude-3-5-sonnet-latest', secret_ref: 'ANTHROPIC_API_KEY' },
  { id: 'prov-compat', name: 'OpenAI-Compatible', provider_type: 'openai_compatible', is_enabled: false, default_model: 'gpt-4o', secret_ref: 'COMPAT_API_KEY' },
];

const DEMO_QTYPES: QuestionTypeDef[] = [
  { id: 'qt-mcq-s', code: 'multiple_choice_single', name_th: 'ปรนัยคำตอบเดียว', name_en: 'Multiple Choice — Single', requires_choices: true, requires_answer: true, supports_rubric: false, supports_ai_generation: true, is_active: true, sort_order: 10 },
  { id: 'qt-mcq-m', code: 'multiple_choice_multiple', name_th: 'ปรนัยหลายคำตอบ', name_en: 'Multiple Choice — Multiple', requires_choices: true, requires_answer: true, supports_rubric: false, supports_ai_generation: true, is_active: true, sort_order: 20 },
  { id: 'qt-tf', code: 'true_false', name_th: 'ถูกหรือผิด', name_en: 'True / False', requires_choices: false, requires_answer: true, supports_rubric: false, supports_ai_generation: true, is_active: true, sort_order: 30 },
  { id: 'qt-sa', code: 'short_answer', name_th: 'คำตอบสั้น', name_en: 'Short Answer', requires_choices: false, requires_answer: true, supports_rubric: false, supports_ai_generation: true, is_active: true, sort_order: 40 },
  { id: 'qt-essay', code: 'essay', name_th: 'อัตนัย', name_en: 'Essay', requires_choices: false, requires_answer: true, supports_rubric: true, supports_ai_generation: true, is_active: true, sort_order: 50 },
  { id: 'qt-fib', code: 'fill_in_blank', name_th: 'เติมคำ', name_en: 'Fill in the Blank', requires_choices: false, requires_answer: true, supports_rubric: false, supports_ai_generation: true, is_active: true, sort_order: 60 },
  { id: 'qt-case', code: 'case_study', name_th: 'กรณีศึกษา', name_en: 'Case Study', requires_choices: false, requires_answer: true, supports_rubric: true, supports_ai_generation: true, is_active: true, sort_order: 80 },
];

const DEMO_DIFFS: DifficultyDefinition[] = [
  { id: 'diff-easy', code: 'easy', name_th: 'ง่าย', name_en: 'Easy', description: 'Direct recall', sort_order: 1, is_active: true },
  { id: 'diff-medium', code: 'medium', name_th: 'ปานกลาง', name_en: 'Medium', description: 'Application', sort_order: 2, is_active: true },
  { id: 'diff-hard', code: 'hard', name_th: 'ยาก', name_en: 'Hard', description: 'Analysis/synthesis', sort_order: 3, is_active: true },
];

const STAGE_PROGRESS: Record<string, { pct: number; message: string }> = {
  QUEUED: { pct: 0, message: 'รอคิวเริ่มต้น' },
  RETRIEVE: { pct: 10, message: 'กำลังดึงหลักฐานจากเอกสาร' },
  ANALYZE: { pct: 30, message: 'กำลังวิเคราะห์ความครอบคลุม' },
  GENERATE: { pct: 60, message: 'กำลังสร้างข้อสอบ' },
  VERIFY: { pct: 85, message: 'กำลังตรวจสอบคุณภาพ' },
  DONE: { pct: 100, message: 'เสร็จสิ้น' },
};

type PipelineOptions = { onProgress?: (update: GenerationProgressUpdate) => void };

async function setJobStage(
  jobId: string,
  stage: string,
  extras: Partial<GenerationJob> = {},
  onProgress?: (update: GenerationProgressUpdate) => void,
) {
  const meta = STAGE_PROGRESS[stage] || { pct: extras.progress_pct ?? 0, message: extras.stage_message || stage };
  const patch: Partial<GenerationJob> = {
    status: (extras.status as GenerationJob['status']) || 'running',
    progress_pct: extras.progress_pct ?? meta.pct,
    current_stage: stage,
    stage_message: extras.stage_message || meta.message,
    ...extras,
  };
  try {
    await updateGenerationJob(jobId, patch);
  } catch {
    // Job progress must not abort the pipeline.
  }
  onProgress?.({
    progressPct: patch.progress_pct ?? meta.pct,
    currentStage: stage,
    stageMessage: patch.stage_message || meta.message,
    jobId,
    status: patch.status,
  });
}

async function runLocalPipeline(
  request: GenerationV2Request,
  options: PipelineOptions = {},
): Promise<GenerationV2Result> {
  const executionId = `exec-${Date.now()}`;
  const jobId = `job-${Date.now()}`;
  const knowledgeBounded = request.knowledgeBounded !== false;
  const ruleSetId = request.ruleSetId || 'rs-system-default';
  const workflowId = request.workflowId || 'wf-exam-default';
  const now = new Date().toISOString();
  const onProgress = options.onProgress;

  await createGenerationJob({
    id: jobId,
    course_id: request.courseId,
    blueprint_id: request.blueprintId || null,
    document_ids: request.documentIds,
    learning_outcome_ids: request.learningOutcomeIds,
    question_type: request.questionType as Question['question_type'],
    bloom_level: request.bloomLevel as Question['intended_bloom_level'],
    difficulty: request.difficulty as Question['intended_difficulty'],
    number_of_questions: request.numberOfQuestions,
    language: request.language,
    marks_per_question: request.marksPerQuestion,
    include_explanation: request.includeExplanation,
    include_rubric: request.includeRubric,
    status: 'queued',
    generated_count: 0,
    failed_count: 0,
    total_questions: request.numberOfQuestions,
    created_by: request.createdBy,
    created_at: now,
    progress_pct: 0,
    current_stage: 'QUEUED',
    stage_message: STAGE_PROGRESS.QUEUED.message,
    request_json: request as unknown as Record<string, unknown>,
    mode: request.mode,
    provider_id: request.providerId || null,
    knowledge_bounded: knowledgeBounded,
    rule_set_id: ruleSetId,
  });
  onProgress?.({
    progressPct: 0,
    currentStage: 'QUEUED',
    stageMessage: STAGE_PROGRESS.QUEUED.message,
    jobId,
    status: 'queued',
  });

  const { runId } = await workflowEngine.startRun({
    workflowId, mode: request.mode, courseId: request.courseId, createdBy: request.createdBy, request,
  });

  await updateGenerationJob(jobId, {
    status: 'running',
    started_at: new Date().toISOString(),
    workflow_run_id: runId,
  }).catch(() => undefined);

  await workflowEngine.recordStep(runId, 'DEFINE', 'completed', { request });
  await workflowEngine.recordStep(runId, 'KNOWLEDGE_PREPARE', 'completed');

  await setJobStage(jobId, 'RETRIEVE', {}, onProgress);
  const query = `${request.questionType} ${request.bloomLevel} ${request.difficulty} ${(request.learningOutcomeCodes || []).join(' ')}`;
  const evidencePack = await knowledgeProvider.retrieveWithCitations(query, {
    courseId: request.courseId,
    documentIds: request.documentIds,
    topK: 10,
  });
  evidencePack.learningOutcomes = request.learningOutcomeCodes || [];
  await workflowEngine.recordStep(runId, 'RETRIEVE', 'completed', { chunkCount: evidencePack.retrievedChunks.length });

  await setJobStage(jobId, 'ANALYZE', {}, onProgress);
  const analysis = await analysisEngine.analyze(request, evidencePack);
  await workflowEngine.recordStep(runId, 'ANALYZE', 'completed', analysis);

  if (analysis.insufficientEvidence || analysis.decision === 'reject') {
    await workflowEngine.completeRun(runId, 'failed', analysis);
    const failResult: GenerationV2Result = {
      success: false,
      status: 'INSUFFICIENT_EVIDENCE',
      mode: request.mode,
      executionId,
      workflowRunId: runId,
      evidencePack,
      analysis,
      questions: [],
      insufficientEvidence: true,
      error: analysis.reason.join('; '),
    };
    await setJobStage(jobId, 'DONE', {
      status: 'failed',
      progress_pct: 100,
      stage_message: failResult.error || 'หลักฐานไม่เพียงพอ',
      error_message: failResult.error || null,
      result_json: failResult as unknown as Record<string, unknown>,
      completed_at: new Date().toISOString(),
      failed_count: request.numberOfQuestions,
    }, onProgress);
    return failResult;
  }

  const rules = await ruleEngine.getRulesForSet(ruleSetId);
  const preRules = await ruleEngine.evaluate({ rules, mode: request.mode, knowledgeBounded, evidencePack });
  if (!preRules.passed) {
    await workflowEngine.completeRun(runId, 'failed', preRules);
    const failResult: GenerationV2Result = {
      success: false,
      status: 'RULE_BLOCKED',
      mode: request.mode,
      executionId,
      workflowRunId: runId,
      evidencePack,
      analysis,
      questions: [],
      ruleEvaluation: preRules,
      error: preRules.violations.map(v => v.message).join('; '),
    };
    await setJobStage(jobId, 'DONE', {
      status: 'failed',
      progress_pct: 100,
      stage_message: failResult.error || 'กฎควบคุมไม่อนุญาต',
      error_message: failResult.error || null,
      result_json: failResult as unknown as Record<string, unknown>,
      completed_at: new Date().toISOString(),
      failed_count: request.numberOfQuestions,
    }, onProgress);
    return failResult;
  }

  await setJobStage(jobId, 'GENERATE', {}, onProgress);

  // Generate via edge (preferred) or DemoAI
  let generated: Array<Record<string, unknown>> = [];
  let savedQuestions: Question[] = [];
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, model: 'demo-model', estimatedCostUsd: 0, provider: 'demo', latencyMs: 0 };
  let usedProvider = request.providerId || 'prov-demo';
  let usageLogged = false;
  let providerError: string | null = null;

  if (!isDemoMode) {
    try {
      const { ok, data } = await invokeEdgeFunction<{
        success?: boolean;
        questions?: unknown[];
        savedQuestions?: Question[];
        demoMode?: boolean;
        usageLogged?: boolean;
        usage?: typeof usage;
        error?: string;
      }>('exam-engine', { action: 'generate', request, evidencePack, analysis });
      if (ok && data.success && data.questions?.length) {
        generated = data.questions as Array<Record<string, unknown>>;
        savedQuestions = data.savedQuestions || [];
        if (data.usage) usage = { ...usage, ...data.usage };
        usedProvider = request.providerId || data.usage?.provider || 'prov-openai';
        usageLogged = Boolean(data.usageLogged);
      } else if (data.demoMode) {
        // No provider secret — fall through to the local demo generator.
      } else if (data.error || !ok) {
        providerError = data.error || 'ผู้ให้บริการ AI ตอบกลับไม่สำเร็จ';
      }
    } catch {
      // Edge function unreachable — keep the demo fallback.
    }
  }

  if (providerError) {
    await workflowEngine.completeRun(runId, 'failed', { error: providerError });
    const failResult: GenerationV2Result = {
      success: false,
      status: 'failed',
      mode: request.mode,
      executionId,
      workflowRunId: runId,
      evidencePack,
      analysis,
      questions: [],
      error: providerError,
    };
    await setJobStage(jobId, 'DONE', {
      status: 'failed',
      progress_pct: 100,
      stage_message: providerError,
      error_message: providerError,
      result_json: failResult as unknown as Record<string, unknown>,
      completed_at: new Date().toISOString(),
      failed_count: request.numberOfQuestions,
      model: usage.model,
    }, onProgress);
    return failResult;
  }

  if (!generated.length) {
    const provider = new DemoAIProvider();
    const batch = await provider.generateQuestions({
      courseId: request.courseId,
      documentIds: request.documentIds,
      learningOutcomeIds: request.learningOutcomeIds,
      questionType: request.questionType as Question['question_type'],
      bloomLevel: request.bloomLevel as Question['intended_bloom_level'],
      difficulty: request.difficulty as Question['intended_difficulty'],
      numberOfQuestions: request.numberOfQuestions,
      language: request.language,
      marksPerQuestion: request.marksPerQuestion,
      includeExplanation: request.includeExplanation,
      includeRubric: request.includeRubric,
    });
    generated = batch.questions.map(q => ({ ...q }));
    usage = {
      inputTokens: batch.inputTokens,
      outputTokens: batch.outputTokens,
      totalTokens: batch.inputTokens + batch.outputTokens,
      model: batch.model,
      estimatedCostUsd: 0,
      provider: 'demo',
      latencyMs: 0,
    };
    usedProvider = 'prov-demo';
  }

  await workflowEngine.recordStep(runId, 'GENERATE', 'completed', { count: generated.length, provider: usedProvider });

  await setJobStage(jobId, 'VERIFY', { model: usage.model }, onProgress);

  // Map to question rows (rubric retry via edge before any static template)
  const citation = evidencePack.citations[0];
  const questionRows: Partial<Question>[] = [];
  for (const gq of generated) {
    const text = String(gq.questionText || gq.question_text || '');
    const choices = (gq.choices as Question['choices']) || null;
    const qType = (gq.questionType || gq.question_type || request.questionType) as Question['question_type'];
    const marks = Number(gq.marks || request.marksPerQuestion);
    let normalized = normalizeRubric(gq.rubric, marks);
    const needsRubric = (request.includeRubric || qType === 'essay' || qType === 'case_study') && !normalized;
    if (needsRubric && !isDemoMode) {
      try {
        const { ok, data } = await invokeEdgeFunction<{ success?: boolean; rubric?: unknown }>('exam-engine', {
          action: 'rubric_retry',
          questionText: text,
          questionType: qType,
          marks,
          language: request.language,
          courseId: request.courseId,
          providerId: request.providerId,
        });
        if (ok && data.success && data.rubric) {
          normalized = normalizeRubric(data.rubric, marks);
        }
      } catch {
        // leave null — avoid silent static rubric in real mode when model retry fails
      }
    }
    const rubric = normalized
      || (isDemoMode
        ? ensureRubricForQuestion({
          questionType: qType,
          marks,
          includeRubric: request.includeRubric || qType === 'essay' || qType === 'case_study',
          rubric: null,
        })
        : null);

    const predictedBloom = (gq.predictedBloomLevel || gq.aiPredictedBloomLevel || gq.bloomLevel || request.bloomLevel) as Question['intended_bloom_level'];
    const predictedDiff = (gq.predictedDifficulty || gq.aiPredictedDifficulty || gq.difficulty || request.difficulty) as Question['intended_difficulty'];

    questionRows.push({
      course_id: request.courseId,
      question_type: qType,
      question_text: text,
      language: request.language,
      topic: (gq.topic as string) || null,
      tags: Array.isArray(gq.tags) ? (gq.tags as string[]) : [],
      choices,
      correct_answer: (gq.correctAnswer || gq.correct_answer || '') as string,
      explanation: String(gq.explanation || ''),
      intended_bloom_level: (gq.bloomLevel || gq.intended_bloom_level || request.bloomLevel) as Question['intended_bloom_level'],
      ai_predicted_bloom_level: predictedBloom,
      intended_difficulty: (gq.difficulty || request.difficulty) as Question['intended_difficulty'],
      ai_predicted_difficulty: predictedDiff,
      marks,
      estimated_answer_time_minutes: Number(gq.estimatedAnswerTimeMinutes || 2),
      source_references: citation
        ? [{ document_id: citation.document_id, file_name: '', page: citation.page || 0, section: citation.section || '', quote: citation.quote }]
        : [],
      rubric,
      learning_outcome_codes: (gq.learningOutcomeCodes as string[]) || request.learningOutcomeCodes || [],
      quality_flags: [],
      status: 'ai_generated',
      source_type: 'ai_generated',
      created_by: request.createdBy,
      generated_by_ai: true,
      ai_model: usage.model,
      content_hash: contentHashForQuestion(text),
    });
  }

  let mutableQuestionRows = questionRows;
  const bankQuestions = await listQuestions({ courseId: request.courseId });
  const bankHashes = bankQuestions.map(q => q.content_hash || contentHashForQuestion(q.question_text));

  // Verify + optional one correction pass (demo: drop failing duplicates)
  let verifications = await verificationEngine.verifyBatch(mutableQuestionRows, {
    evidencePack,
    knowledgeBounded,
    bankQuestions,
    existingHashes: bankHashes,
  });
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const failedIdx = verifications.map((v, i) => (v.status === 'fail' ? i : -1)).filter(i => i >= 0);
    if (!failedIdx.length) break;
    // remove hard failures that are duplicates / missing text
    mutableQuestionRows = mutableQuestionRows.filter((_, i) => verifications[i].status !== 'fail' || !verifications[i].violations.includes('duplicate'));
    verifications = await verificationEngine.verifyBatch(mutableQuestionRows, {
      evidencePack,
      knowledgeBounded,
      bankQuestions,
      existingHashes: bankHashes,
    });
  }

  await workflowEngine.recordStep(runId, 'VERIFY', 'completed', { results: verifications });

  // Persist
  if (!savedQuestions.length) {
    const toSave: Partial<Question>[] = mutableQuestionRows.map((q, i) => {
      const dup = verifications[i]?.duplicateMatches?.[0];
      const flags = [...(q.quality_flags || [])];
      if (verifications[i]?.violations.includes('duplicate')) flags.push('duplicate');
      if (verifications[i]?.violations.includes('near_duplicate')) flags.push('near_duplicate');
      return {
        ...q,
        status: verifications[i]?.status === 'fail' ? 'validation_failed' : 'ready_for_review',
        quality_score: verifications[i]?.score ?? 80,
        content_hash: contentHashForQuestion(q.question_text || ''),
        near_duplicate_of: dup?.questionId || null,
        near_duplicate_score: dup?.score ?? null,
        duplicate_matches: verifications[i]?.duplicateMatches || null,
        quality_flags: flags,
        generation_mode: request.mode,
        evidence_ids: evidencePack.retrievedChunks.slice(0, 3).map(c => c.id),
        verification_status: verifications[i]?.status,
        verification_score: verifications[i]?.score,
        quality_dimensions: verifications[i]?.dimensions,
        workflow_run_id: runId,
      };
    });
    savedQuestions = await insertQuestions(toSave);
  } else {
    // mark ready for review when possible
  }

  const postRules = await ruleEngine.evaluate({
    rules, mode: request.mode, knowledgeBounded, questions: savedQuestions, evidencePack,
  });

  const completedAt = new Date().toISOString();
  const successResult: GenerationV2Result = {
    success: true,
    status: 'completed',
    mode: request.mode,
    executionId,
    workflowRunId: runId,
    evidencePack,
    analysis,
    questions: generated,
    savedQuestions,
    verification: verifications,
    ruleEvaluation: postRules,
    usage,
  };

  await setJobStage(jobId, 'DONE', {
    status: 'completed',
    progress_pct: 100,
    stage_message: STAGE_PROGRESS.DONE.message,
    generated_count: savedQuestions.length,
    failed_count: Math.max(0, request.numberOfQuestions - savedQuestions.length),
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    estimated_cost_usd: usage.estimatedCostUsd,
    model: usage.model,
    completed_at: completedAt,
    result_json: {
      savedCount: savedQuestions.length,
      executionId,
      workflowRunId: runId,
      usage,
    },
    workflow_run_id: runId,
    provider_id: usedProvider,
  }, onProgress);

  if (!usageLogged) {
    await createUsageLog({
      id: `usage-${Date.now()}`,
      user_id: request.createdBy,
      course_id: request.courseId,
      provider: usage.provider || usedProvider,
      model: usage.model,
      request_type: 'question_generation_v2',
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      estimated_cost_usd: usage.estimatedCostUsd,
      latency_ms: usage.latencyMs || 0,
      status: 'success',
      created_at: completedAt,
    });
  }

  await createNotification({
    id: `n-${Date.now()}`,
    user_id: request.createdBy,
    type: 'generation_completed',
    title: 'สร้างข้อสอบเสร็จสิ้น (V2)',
    message: `โหมด ${request.mode}: สร้าง ${savedQuestions.length} ข้อ ผ่าน verification แล้วส่งคิวตรวจ`,
    link: '/review',
    read: false,
    created_at: completedAt,
  });

  if (!isDemoMode && supabase) {
    await supabase.from('generation_executions').insert({
      id: executionId,
      workflow_run_id: runId,
      mode: request.mode,
      course_id: request.courseId,
      user_id: request.createdBy,
      rule_set_id: ruleSetId,
      provider_id: usedProvider,
      model: usage.model,
      knowledge_bounded: knowledgeBounded,
      evidence_pack: evidencePack,
      analysis_result: analysis,
      request_json: request,
      output_json: { questions: savedQuestions },
      verification_json: verifications,
      token_usage: usage,
      estimated_cost_usd: usage.estimatedCostUsd,
      status: 'completed',
      completed_at: completedAt,
    });
  }

  await workflowEngine.recordStep(runId, 'HUMAN_REVIEW', 'pending', { questionCount: savedQuestions.length });
  await workflowEngine.completeRun(runId, 'awaiting_review', { savedCount: savedQuestions.length });

  return successResult;
}

async function enqueueGenerationJob(request: GenerationV2Request): Promise<string> {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const knowledgeBounded = request.knowledgeBounded !== false;
  const now = new Date().toISOString();
  await createGenerationJob({
    id: jobId,
    course_id: request.courseId,
    blueprint_id: request.blueprintId || null,
    document_ids: request.documentIds,
    learning_outcome_ids: request.learningOutcomeIds,
    question_type: request.questionType as Question['question_type'],
    bloom_level: request.bloomLevel as Question['intended_bloom_level'],
    difficulty: request.difficulty as Question['intended_difficulty'],
    number_of_questions: request.numberOfQuestions,
    language: request.language,
    marks_per_question: request.marksPerQuestion,
    include_explanation: request.includeExplanation,
    include_rubric: request.includeRubric,
    status: 'queued',
    generated_count: 0,
    failed_count: 0,
    total_questions: request.numberOfQuestions,
    created_by: request.createdBy,
    created_at: now,
    progress_pct: 0,
    current_stage: 'QUEUED',
    stage_message: STAGE_PROGRESS.QUEUED.message,
    request_json: request as unknown as Record<string, unknown>,
    mode: request.mode,
    provider_id: request.providerId || null,
    knowledge_bounded: knowledgeBounded,
    rule_set_id: request.ruleSetId || 'rs-system-default',
    attempt_count: 0,
    max_attempts: 3,
  });
  return jobId;
}

async function wakeGenerationWorker(jobId: string): Promise<void> {
  // Fire-and-forget: edge returns 202 and continues via EdgeRuntime.waitUntil.
  // Closing the browser after this request is accepted must not stop the worker.
  try {
    await invokeEdgeFunction('process-generation-job', { action: 'wake', jobId });
  } catch {
    // pg_cron / manual claim_and_process remains the safety net.
  }
}

async function waitForGenerationJob(
  jobId: string,
  options: {
    onProgress?: (update: GenerationProgressUpdate) => void;
    pollMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<GenerationV2Result> {
  const pollMs = options.pollMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  const started = Date.now();
  let lastStage = '';

  while (Date.now() - started < timeoutMs) {
    const job = await getGenerationJob(jobId);
    if (!job) {
      return {
        success: false,
        status: 'failed',
        mode: 'ai',
        executionId: `exec-missing-${jobId}`,
        questions: [],
        error: `ไม่พบงาน ${jobId}`,
      };
    }

    const stage = job.current_stage || job.status;
    if (stage !== lastStage || job.progress_pct != null) {
      lastStage = stage;
      options.onProgress?.({
        progressPct: job.progress_pct ?? 0,
        currentStage: job.current_stage || job.status,
        stageMessage: job.stage_message || undefined,
        jobId,
        status: job.status,
      });
    }

    if (job.status === 'completed') {
      const result = (job.result_json || {}) as unknown as GenerationV2Result;
      return {
        success: true,
        status: 'completed',
        mode: (result.mode as GenerationMode) || (job.mode as GenerationMode) || 'ai',
        executionId: result.executionId || `exec-${jobId}`,
        workflowRunId: result.workflowRunId,
        evidencePack: result.evidencePack,
        analysis: result.analysis,
        questions: result.questions || [],
        savedQuestions: result.savedQuestions || [],
        verification: result.verification,
        ruleEvaluation: result.ruleEvaluation,
        usage: result.usage,
      };
    }

    if (job.status === 'failed') {
      const result = (job.result_json || {}) as unknown as GenerationV2Result;
      return {
        success: false,
        status: result.insufficientEvidence ? 'INSUFFICIENT_EVIDENCE' : 'failed',
        mode: (job.mode as GenerationMode) || 'ai',
        executionId: result.executionId || `exec-${jobId}`,
        questions: [],
        savedQuestions: [],
        insufficientEvidence: result.insufficientEvidence,
        error: job.error_message || job.last_error || result.error || 'งานสร้างข้อสอบล้มเหลว',
        evidencePack: result.evidencePack,
        analysis: result.analysis,
      };
    }

    await new Promise(resolve => setTimeout(resolve, pollMs));
  }

  return {
    success: false,
    status: 'failed',
    mode: 'ai',
    executionId: `exec-timeout-${jobId}`,
    questions: [],
    error: 'หมดเวลารอผลจาก background worker — งานอาจยังรันอยู่ที่หน้าประวัติงานสร้างข้อสอบ',
  };
}

export const aiOrchestrator: AIOrchestrator = {
  async enqueueGeneration(request) {
    const jobId = await enqueueGenerationJob(request);
    if (!isDemoMode) await wakeGenerationWorker(jobId);
    return { jobId };
  },

  async waitForJob(jobId, options) {
    return waitForGenerationJob(jobId, options);
  },

  async runGeneration(request, options) {
    // Demo mode has no edge worker — keep in-process pipeline.
    if (isDemoMode || !supabase) {
      return runLocalPipeline(request, options);
    }

    // Real mode: enqueue only; detached worker runs retrieve→analyze→generate→verify.
    const jobId = await enqueueGenerationJob(request);
    options?.onProgress?.({
      progressPct: 0,
      currentStage: 'QUEUED',
      stageMessage: 'ใส่คิวแล้ว — worker กำลังทำงานแม้ปิดเบราว์เซอร์',
      jobId,
      status: 'queued',
    });
    await wakeGenerationWorker(jobId);
    return waitForGenerationJob(jobId, options);
  },

  async listProviders() {
    const rows = await aiProviderService.listProviders();
    return rows as AIProviderConfig[];
  },

  async listQuestionTypes() {
    if (isDemoMode || !supabase) return DEMO_QTYPES;
    const { data, error } = await supabase.from('question_types').select('*').eq('is_active', true).order('sort_order');
    if (error) throw error;
    return (data || []) as QuestionTypeDef[];
  },

  async listDifficulties() {
    if (isDemoMode || !supabase) return DEMO_DIFFS;
    const { data, error } = await supabase.from('difficulty_definitions').select('*').eq('is_active', true).order('sort_order');
    if (error) throw error;
    return (data || []) as DifficultyDefinition[];
  },

  async testProvider(providerId, apiKey) {
    return aiProviderService.testProvider(providerId, apiKey);
  },
};

export { runLocalPipeline, DEMO_PROVIDERS, DEMO_QTYPES, DEMO_DIFFS };

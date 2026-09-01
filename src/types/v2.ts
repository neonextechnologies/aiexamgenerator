/** V2 shared domain types for Controlled Hybrid AI Examination Platform */
import type { Question } from './index';

export type GenerationMode = 'manual' | 'hybrid' | 'ai';

export type ProviderType = 'demo' | 'openai' | 'gemini' | 'anthropic' | 'openai_compatible';

export type RuleScope = 'SYSTEM' | 'MANDATORY' | 'ORGANIZATION' | 'COURSE' | 'WORKFLOW' | 'GENERATION' | 'USER';
export type RuleSeverity = 'info' | 'warning' | 'error' | 'critical';

export type WorkflowStepCode =
  | 'DEFINE'
  | 'KNOWLEDGE_PREPARE'
  | 'PLAN'
  | 'RETRIEVE'
  | 'ANALYZE'
  | 'GENERATE'
  | 'VERIFY'
  | 'HUMAN_REVIEW'
  | 'APPROVE'
  | 'DELIVER';

export type VerificationStatus = 'pass' | 'warning' | 'fail';

export interface QuestionTypeDef {
  id: string;
  code: string;
  name_th: string;
  name_en: string;
  description?: string | null;
  requires_choices: boolean;
  requires_answer: boolean;
  supports_rubric: boolean;
  supports_ai_generation: boolean;
  is_active: boolean;
  sort_order: number;
  config_json?: Record<string, unknown>;
}

export interface DifficultyDefinition {
  id: string;
  code: string;
  name_th: string;
  name_en: string;
  description?: string | null;
  criteria_json?: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  course_id?: string | null;
  chunk_index: number;
  content: string;
  page_number?: number | null;
  section?: string | null;
  heading?: string | null;
  token_count: number;
  metadata_json?: Record<string, unknown>;
  created_at?: string;
}

export interface EvidenceCitation {
  chunk_id: string;
  document_id: string;
  page?: number | null;
  section?: string | null;
  quote: string;
  score: number;
}

export interface EvidencePack {
  courseId: string;
  learningOutcomes: string[];
  topic?: string;
  documents: string[];
  retrievedChunks: DocumentChunk[];
  citations: EvidenceCitation[];
  coverageScore: number;
  retrievalConfidence: number;
}

export interface AnalysisDecision {
  decision: 'approve' | 'revise' | 'reject';
  reason: string[];
  coverage: Record<string, number>;
  recommendedQuestionTypes: string[];
  recommendedBloomLevels: string[];
  recommendedDifficulty: string[];
  generationPlan: Array<Record<string, unknown>>;
  insufficientEvidence?: boolean;
}

export interface Rule {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  scope: RuleScope;
  priority: number;
  rule_type: string;
  condition_json: Record<string, unknown>;
  action_json: Record<string, unknown>;
  severity: RuleSeverity;
  is_blocking: boolean;
  is_active: boolean;
  is_locked: boolean;
  version: number;
}

export interface RuleSet {
  id: string;
  name: string;
  description?: string | null;
  scope: string;
  is_active: boolean;
}

export interface RuleEvaluationResult {
  passed: boolean;
  violations: Array<{
    ruleId: string;
    code: string;
    severity: RuleSeverity;
    message: string;
    blocking: boolean;
  }>;
  appliedRuleIds: string[];
}

export interface VerificationCheck {
  code: string;
  name: string;
  status: VerificationStatus;
  deterministic: boolean;
  message: string;
  score?: number;
}

export interface VerificationResult {
  status: VerificationStatus;
  score: number;
  checks: VerificationCheck[];
  violations: string[];
  recommendations: string[];
  dimensions?: Record<string, number>;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  provider_type: ProviderType;
  is_enabled: boolean;
  base_url?: string | null;
  default_model?: string | null;
  analysis_model?: string | null;
  generation_model?: string | null;
  verification_model?: string | null;
  embedding_model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  timeout_ms?: number | null;
  daily_limit?: number | null;
  monthly_budget_usd?: number | null;
  secret_ref?: string | null;
  last_tested_at?: string | null;
  last_test_status?: string | null;
  config_json?: Record<string, unknown>;
}

export interface GenerationV2Request {
  mode: GenerationMode;
  courseId: string;
  documentIds: string[];
  learningOutcomeIds: string[];
  learningOutcomeCodes?: string[];
  topicIds?: string[];
  blueprintId?: string | null;
  questionType: string;
  bloomLevel: string;
  difficulty: string;
  numberOfQuestions: number;
  language: 'th' | 'en';
  marksPerQuestion: number;
  includeExplanation: boolean;
  includeRubric: boolean;
  knowledgeBounded?: boolean;
  ruleSetId?: string | null;
  workflowId?: string | null;
  providerId?: string | null;
  createdBy: string;
}

export interface GenerationV2Result {
  success: boolean;
  status: string;
  mode: GenerationMode;
  executionId: string;
  workflowRunId?: string;
  evidencePack?: EvidencePack;
  analysis?: AnalysisDecision;
  questions: Array<Record<string, unknown>>;
  savedQuestions?: Question[];
  verification?: VerificationResult[];
  ruleEvaluation?: RuleEvaluationResult;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; model: string; estimatedCostUsd: number };
  error?: string;
  insufficientEvidence?: boolean;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export interface WorkflowStepDef {
  id: string;
  code: WorkflowStepCode | string;
  name: string;
  sort_order: number;
  ai_enabled: boolean;
  manual_approval_required: boolean;
  rule_set_id?: string | null;
}

export interface ChatContext {
  courseId?: string;
  documentId?: string;
  questionId?: string;
  examId?: string;
  blueprintId?: string;
  workflowId?: string;
  ruleSetId?: string;
  page?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata_json?: Record<string, unknown>;
  created_at?: string;
}

export interface ProposedAction {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  preview: string;
  status: 'proposed' | 'confirmed' | 'executed' | 'cancelled';
}

import type {
  AnalysisDecision,
  EvidencePack,
  GenerationV2Request,
  GenerationV2Result,
  Rule,
  RuleEvaluationResult,
  RuleSet,
  RuleScope,
  RuleSeverity,
  VerificationResult,
  DocumentChunk,
  AIProviderConfig,
  QuestionTypeDef,
  DifficultyDefinition,
  WorkflowDef,
  WorkflowStepDef,
  ChatContext,
  ChatMessage,
  ProposedAction,
} from '../types/v2';
import type { Question } from '../types';

export interface KnowledgeProvider {
  ingestDocument(documentId: string, text: string, meta?: Record<string, unknown>): Promise<{ chunkCount: number }>;
  deleteDocument(documentId: string): Promise<void>;
  reindexDocument(documentId: string): Promise<{ chunkCount: number }>;
  retrieve(query: string, opts: { courseId?: string; documentIds: string[]; topK?: number }): Promise<DocumentChunk[]>;
  retrieveWithCitations(query: string, opts: { courseId?: string; documentIds: string[]; topK?: number }): Promise<EvidencePack>;
  healthCheck(): Promise<boolean>;
}

export interface CreateRuleInput {
  ruleSetId: string;
  code: string;
  name: string;
  description?: string;
  scope: RuleScope;
  priority: number;
  rule_type: string;
  severity: RuleSeverity;
  is_blocking: boolean;
  is_active: boolean;
  condition_json?: Record<string, unknown>;
  action_json?: Record<string, unknown>;
  createdBy?: string;
}

export interface RuleEngine {
  listRules(): Promise<Rule[]>;
  listRuleSets(): Promise<RuleSet[]>;
  getRulesForSet(ruleSetId: string): Promise<Rule[]>;
  createRule(input: CreateRuleInput): Promise<Rule>;
  evaluate(input: {
    rules: Rule[];
    mode: string;
    knowledgeBounded: boolean;
    questions?: Partial<Question>[];
    evidencePack?: EvidencePack | null;
  }): Promise<RuleEvaluationResult>;
}

export interface CreateWorkflowStepInput {
  workflowVersionId: string;
  code: string;
  name: string;
  sort_order: number;
  ai_enabled: boolean;
  manual_approval_required: boolean;
  rule_set_id?: string | null;
}

export interface WorkflowEngine {
  listWorkflows(): Promise<WorkflowDef[]>;
  getPublishedVersion(workflowId: string): Promise<string | null>;
  getSteps(workflowVersionId: string): Promise<WorkflowStepDef[]>;
  createStep(input: CreateWorkflowStepInput): Promise<WorkflowStepDef>;
  updateStepOrder(stepId: string, sortOrder: number): Promise<void>;
  reorderSteps(versionId: string, orderedStepIds: string[]): Promise<WorkflowStepDef[]>;
  startRun(input: {
    workflowId: string;
    mode: string;
    courseId: string;
    createdBy: string;
    request: GenerationV2Request;
  }): Promise<{ runId: string; versionId: string }>;
  recordStep(runId: string, stepCode: string, status: string, output?: unknown, error?: string): Promise<void>;
  completeRun(runId: string, status: string, output?: unknown): Promise<void>;
}

export interface VerificationEngine {
  verifyQuestion(question: Partial<Question>, ctx: {
    evidencePack?: EvidencePack | null;
    knowledgeBounded: boolean;
    existingHashes?: string[];
    bankQuestions?: Array<{ id: string; question_text: string; content_hash?: string | null; course_id?: string }>;
    excludeId?: string;
    nearThreshold?: number;
  }): Promise<VerificationResult>;
  verifyBatch(questions: Partial<Question>[], ctx: {
    evidencePack?: EvidencePack | null;
    knowledgeBounded: boolean;
    existingHashes?: string[];
    bankQuestions?: Array<{ id: string; question_text: string; content_hash?: string | null; course_id?: string }>;
    nearThreshold?: number;
  }): Promise<VerificationResult[]>;
}

export interface AnalysisEngine {
  analyze(request: GenerationV2Request, evidence: EvidencePack): Promise<AnalysisDecision>;
}

export interface GenerationProgressUpdate {
  progressPct: number;
  currentStage: string;
  stageMessage?: string;
  jobId?: string;
  status?: string;
}

export interface AIOrchestrator {
  runGeneration(
    request: GenerationV2Request,
    options?: { onProgress?: (update: GenerationProgressUpdate) => void },
  ): Promise<GenerationV2Result>;
  listProviders(): Promise<AIProviderConfig[]>;
  listQuestionTypes(): Promise<QuestionTypeDef[]>;
  listDifficulties(): Promise<DifficultyDefinition[]>;
  testProvider(providerId: string, apiKey?: string): Promise<{ ok: boolean; message: string }>;
}

export interface ChatAssistant {
  send(sessionId: string | null, message: string, context: ChatContext): Promise<{
    sessionId: string;
    reply: ChatMessage;
    proposedActions: ProposedAction[];
  }>;
  confirmAction(actionId: string): Promise<{ ok: boolean; result?: unknown }>;
}

export interface EmailProvider {
  send(input: { to: string; subject: string; html: string; text?: string }): Promise<{ ok: boolean }>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

export interface NotificationService {
  notify(input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    category?: string;
  }): Promise<void>;
}

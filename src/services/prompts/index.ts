import { isDemoMode, supabase } from '../../lib/supabase';

export interface PromptTemplate {
  id: string;
  code: string;
  task_type: string;
  name: string;
  system_prompt: string;
  user_template: string;
  version: number;
  is_active: boolean;
  output_schema?: Record<string, unknown> | null;
}

const DEMO_PROMPTS: PromptTemplate[] = [
  {
    id: 'pt-gen-v1',
    code: 'question_generation',
    task_type: 'question_generation',
    name: 'Default Question Generation',
    system_prompt: 'You are an expert educational assessment designer. Return ONLY valid JSON matching the schema. Use ONLY the provided evidence. If evidence is insufficient, return {"status":"INSUFFICIENT_EVIDENCE","questions":[]}.',
    user_template: 'Course: {{course}}\nMode: {{mode}}\nLO: {{learningOutcomes}}\nType: {{questionType}}\nBloom: {{bloom}}\nDifficulty: {{difficulty}}\nCount: {{count}}\nLanguage: {{language}}\nRules: {{rules}}\nEvidence:\n{{evidence}}',
    version: 1,
    is_active: true,
  },
  {
    id: 'pt-analyze',
    code: 'analyze_request',
    task_type: 'analysis',
    name: 'Analyze Generation Request',
    system_prompt: 'You are an assessment planner. Decide approve/revise/reject for a knowledge-bounded exam generation request. Return JSON {"decision":"approve|revise|reject","reason":[...],"coverage":{},"recommendedQuestionTypes":[],"recommendedBloomLevels":[],"recommendedDifficulty":[],"generationPlan":[],"insufficientEvidence":false}.',
    user_template: 'Request: {{requestJson}}\nEvidence coverage: {{coverage}}\nSample evidence:\n{{evidence}}',
    version: 1,
    is_active: true,
  },
  {
    id: 'pt-verify',
    code: 'verify_question',
    task_type: 'verification',
    name: 'Verify Question Quality',
    system_prompt: 'You are an exam quality verifier. Score the question. Return JSON with status, score, checks, violations, recommendations, and dimensions.',
    user_template: 'Question: {{questionJson}}\nEvidence: {{evidence}}\nKnowledgeBounded: {{knowledgeBounded}}',
    version: 1,
    is_active: true,
  },
  {
    id: 'pt-chat',
    code: 'chat_assistant',
    task_type: 'chat',
    name: 'Chat Assistant',
    system_prompt: 'You are a Thai/English exam design assistant for Controlled Hybrid mode. Propose actions only; never mutate data without confirmation. Reply in Thai unless the user writes in English.',
    user_template: 'Context page={{page}} course={{courseId}} exam={{examId}} question={{questionId}}\nUser: {{message}}',
    version: 1,
    is_active: true,
  },
  {
    id: 'pt-predict',
    code: 'predict_bloom_difficulty',
    task_type: 'analysis',
    name: 'Predict Bloom & Difficulty',
    system_prompt: 'Classify the question. Return JSON {"bloomLevel":"...","difficulty":"...","confidence":0-1,"rationale":""}.',
    user_template: 'Question text: {{questionText}}\nType: {{questionType}}\nLanguage: {{language}}',
    version: 1,
    is_active: true,
  },
  {
    id: 'pt-rubric-retry',
    code: 'rubric_retry',
    task_type: 'generation',
    name: 'Rubric Retry',
    system_prompt: 'Create a detailed Thai rubric for the question. Return JSON with rubric criteria.',
    user_template: 'Question: {{questionText}}\nType: {{questionType}}\nMarks: {{marks}}\nLanguage: {{language}}',
    version: 1,
    is_active: true,
  },
  {
    id: 'pt-manual-assist',
    code: 'manual_assist',
    task_type: 'generation',
    name: 'Manual Assist',
    system_prompt: 'Help an instructor improve a question. Return JSON with suggestion fields.',
    user_template: 'Action: {{action}}\nCurrent question: {{questionJson}}\nLanguage: {{language}}',
    version: 1,
    is_active: true,
  },
];

export const promptService = {
  async list(): Promise<PromptTemplate[]> {
    if (isDemoMode || !supabase) return DEMO_PROMPTS.map(row => ({ ...row }));
    const { data, error } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('is_active', true)
      .order('code');
    if (error) throw error;
    return (data || []) as PromptTemplate[];
  },

  async upsert(row: Pick<PromptTemplate, 'id' | 'code' | 'task_type' | 'name' | 'system_prompt' | 'user_template' | 'version' | 'is_active'>): Promise<PromptTemplate> {
    if (isDemoMode || !supabase) {
      const idx = DEMO_PROMPTS.findIndex(item => item.id === row.id || item.code === row.code);
      const next: PromptTemplate = {
        ...(idx >= 0 ? DEMO_PROMPTS[idx] : {
          id: row.id,
          code: row.code,
          task_type: row.task_type,
          name: row.name,
          system_prompt: row.system_prompt,
          user_template: row.user_template,
          version: row.version,
          is_active: true,
        }),
        ...row,
      };
      if (idx >= 0) DEMO_PROMPTS[idx] = next;
      else DEMO_PROMPTS.push(next);
      return { ...next };
    }
    const { data, error } = await supabase.from('prompt_templates').upsert({
      ...row,
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error) throw error;
    return data as PromptTemplate;
  },
};

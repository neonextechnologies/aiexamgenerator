import type { WorkflowDef, WorkflowStepDef, GenerationV2Request } from '../../types/v2';
import type { WorkflowEngine } from '../types';
import { isDemoMode, supabase } from '../../lib/supabase';
import { DEFAULT_WORKFLOW_VERSIONS } from '../../lib/workflow-catalog';

const DEMO_WORKFLOWS: WorkflowDef[] = [
  { id: 'wf-exam-default', name: 'Default Exam Workflow', description: 'Controlled hybrid exam generation pipeline', is_active: true },
];

const DEMO_STEPS: WorkflowStepDef[] = [
  { id: 'wfs-1', code: 'DEFINE', name: 'Define Request', sort_order: 10, ai_enabled: false, manual_approval_required: false },
  { id: 'wfs-2', code: 'KNOWLEDGE_PREPARE', name: 'Prepare Knowledge', sort_order: 20, ai_enabled: false, manual_approval_required: false },
  { id: 'wfs-3', code: 'PLAN', name: 'Plan', sort_order: 30, ai_enabled: true, manual_approval_required: false, rule_set_id: 'rs-system-default' },
  { id: 'wfs-4', code: 'RETRIEVE', name: 'Retrieve Evidence', sort_order: 40, ai_enabled: false, manual_approval_required: false },
  { id: 'wfs-5', code: 'ANALYZE', name: 'Analyze & Decide', sort_order: 50, ai_enabled: true, manual_approval_required: false, rule_set_id: 'rs-system-default' },
  { id: 'wfs-6', code: 'GENERATE', name: 'Generate Questions', sort_order: 60, ai_enabled: true, manual_approval_required: false, rule_set_id: 'rs-system-default' },
  { id: 'wfs-7', code: 'VERIFY', name: 'Verify', sort_order: 70, ai_enabled: true, manual_approval_required: false, rule_set_id: 'rs-system-default' },
  { id: 'wfs-8', code: 'HUMAN_REVIEW', name: 'Human Review', sort_order: 80, ai_enabled: false, manual_approval_required: true },
  { id: 'wfs-9', code: 'APPROVE', name: 'Approve', sort_order: 90, ai_enabled: false, manual_approval_required: true },
  { id: 'wfs-10', code: 'DELIVER', name: 'Deliver', sort_order: 100, ai_enabled: false, manual_approval_required: false },
];

const STEPS_STORAGE_KEY = 'aiexam.custom_workflow_steps';

function readCustomSteps(): WorkflowStepDef[] {
  try {
    const raw = localStorage.getItem(STEPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as WorkflowStepDef[] : [];
  } catch {
    return [];
  }
}

function writeCustomSteps(steps: WorkflowStepDef[]) {
  localStorage.setItem(STEPS_STORAGE_KEY, JSON.stringify(steps));
}

function sortSteps(steps: WorkflowStepDef[]): WorkflowStepDef[] {
  return [...steps].sort((a, b) => a.sort_order - b.sort_order);
}

function demoStepsForVersion(workflowVersionId: string): WorkflowStepDef[] {
  const custom = readCustomSteps().filter(step => (step as WorkflowStepDef & { workflow_version_id?: string }).workflow_version_id === workflowVersionId);
  const byId = new Map<string, WorkflowStepDef>();
  [...DEMO_STEPS, ...custom].forEach(step => byId.set(step.id, step));
  return sortSteps([...byId.values()]);
}

export const workflowEngine: WorkflowEngine = {
  async listWorkflows() {
    if (isDemoMode || !supabase) return DEMO_WORKFLOWS;
    const { data, error } = await supabase.from('workflows').select('*').eq('is_active', true);
    if (error) throw error;
    return (data || []) as WorkflowDef[];
  },

  async getPublishedVersion(workflowId) {
    if (isDemoMode || !supabase) return DEFAULT_WORKFLOW_VERSIONS[workflowId] || null;
    const { data, error } = await supabase
      .from('workflow_versions')
      .select('id')
      .eq('workflow_id', workflowId)
      .eq('is_published', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id || null;
  },

  async getSteps(workflowVersionId) {
    if (isDemoMode || !supabase) return demoStepsForVersion(workflowVersionId);
    const { data, error } = await supabase
      .from('workflow_steps')
      .select('*')
      .eq('workflow_version_id', workflowVersionId)
      .order('sort_order');
    if (error) throw error;
    return sortSteps((data || []) as WorkflowStepDef[]);
  },

  async createStep(input) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code) throw new Error('กรุณาระบุรหัสขั้นตอน');
    if (!input.name.trim()) throw new Error('กรุณาระบุชื่อขั้นตอน');
    if (!input.workflowVersionId) throw new Error('ไม่พบ workflow version');

    const step: WorkflowStepDef & { workflow_version_id?: string } = {
      id: `wfs-${Date.now()}`,
      code,
      name: input.name.trim(),
      sort_order: input.sort_order,
      ai_enabled: input.ai_enabled,
      manual_approval_required: input.manual_approval_required,
      rule_set_id: input.rule_set_id || null,
      workflow_version_id: input.workflowVersionId,
    };

    if (isDemoMode || !supabase) {
      const existing = demoStepsForVersion(input.workflowVersionId);
      if (existing.some(item => item.code === code)) throw new Error(`รหัสขั้นตอน ${code} มีอยู่แล้ว`);
      const custom = readCustomSteps();
      custom.push(step);
      writeCustomSteps(custom);
      return step;
    }

    const { data: existingCode } = await supabase
      .from('workflow_steps')
      .select('id')
      .eq('workflow_version_id', input.workflowVersionId)
      .eq('code', code)
      .maybeSingle();
    if (existingCode) throw new Error(`รหัสขั้นตอน ${code} มีอยู่แล้ว`);

    const { data, error } = await supabase.from('workflow_steps').insert({
      id: step.id,
      workflow_version_id: input.workflowVersionId,
      code: step.code,
      name: step.name,
      sort_order: step.sort_order,
      ai_enabled: step.ai_enabled,
      manual_approval_required: step.manual_approval_required,
      rule_set_id: step.rule_set_id,
      allowed_roles: [],
      required_inputs: [],
      required_outputs: [],
      config_json: {},
    }).select('*').single();
    if (error) throw error;
    return data as WorkflowStepDef;
  },

  async startRun(input) {
    const runId = `wfr-${Date.now()}`;
    const versionId = (await this.getPublishedVersion(input.workflowId)) || 'wfv-exam-1';
    if (isDemoMode || !supabase) return { runId, versionId };
    await supabase.from('workflow_runs').insert({
      id: runId,
      workflow_id: input.workflowId,
      workflow_version_id: versionId,
      course_id: input.courseId,
      mode: input.mode,
      status: 'running',
      current_step: 'DEFINE',
      input_json: input.request as unknown as GenerationV2Request,
      created_by: input.createdBy,
    });
    return { runId, versionId };
  },

  async recordStep(runId, stepCode, status, output, error) {
    if (isDemoMode || !supabase) return;
    await supabase.from('workflow_step_runs').insert({
      id: `wsr-${Date.now()}-${stepCode}`,
      workflow_run_id: runId,
      step_code: stepCode,
      status,
      output_json: output ?? null,
      error: error ?? null,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
    await supabase.from('workflow_runs').update({ current_step: stepCode }).eq('id', runId);
  },

  async completeRun(runId, status, output) {
    if (isDemoMode || !supabase) return;
    await supabase.from('workflow_runs').update({
      status,
      output_json: output ?? null,
      completed_at: new Date().toISOString(),
    }).eq('id', runId);
  },
};

export { DEMO_STEPS };

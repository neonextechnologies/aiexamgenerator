import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, GitBranch, GripVertical, Plus, UserCheck } from 'lucide-react';
import { Badge, Card, Modal, Spinner } from '../ui';
import { ruleEngine, workflowEngine } from '../../services';
import { normalizeStepCode, WORKFLOW_STEP_TEMPLATES } from '../../lib/workflow-catalog';
import type { RuleSet, WorkflowDef, WorkflowStepDef } from '../../types/v2';

const CUSTOM_TEMPLATE = '__custom__';

interface StepFormState {
  templateCode: string;
  code: string;
  name: string;
  sort_order: string;
  ai_enabled: boolean;
  manual_approval_required: boolean;
  rule_set_id: string;
}

function defaultForm(nextSortOrder = 110): StepFormState {
  return {
    templateCode: CUSTOM_TEMPLATE,
    code: '',
    name: '',
    sort_order: String(nextSortOrder),
    ai_enabled: false,
    manual_approval_required: false,
    rule_set_id: '',
  };
}

export function WorkflowsSettingsPanel() {
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [steps, setSteps] = useState<WorkflowStepDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [form, setForm] = useState<StepFormState>(defaultForm());

  const templateOptions = useMemo(() => [
    { value: CUSTOM_TEMPLATE, label: 'กำหนดเอง' },
    ...WORKFLOW_STEP_TEMPLATES.map(template => ({ value: template.code, label: template.name })),
  ], []);

  const nextSortOrder = useMemo(() => {
    if (!steps.length) return 110;
    return Math.max(...steps.map(step => step.sort_order)) + 10;
  }, [steps]);

  const loadWorkflows = async () => {
    const rows = await workflowEngine.listWorkflows();
    setWorkflows(rows);
    if (!selectedWorkflowId && rows[0]?.id) setSelectedWorkflowId(rows[0].id);
    return rows;
  };

  const loadSteps = async (workflowId: string) => {
    if (!workflowId) return;
    setLoading(true);
    setError('');
    try {
      const publishedVersionId = await workflowEngine.getPublishedVersion(workflowId);
      if (!publishedVersionId) {
        setVersionId('');
        setSteps([]);
        setError('ไม่พบ published version ของ workflow นี้');
        return;
      }
      setVersionId(publishedVersionId);
      setSteps(await workflowEngine.getSteps(publishedVersionId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดขั้นตอนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([loadWorkflows(), ruleEngine.listRuleSets()])
      .then(([workflowRows]) => {
        if (workflowRows[0]?.id) setSelectedWorkflowId(workflowRows[0].id);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'โหลด Workflow ไม่สำเร็จ'))
      .finally(() => setLoading(false));
    ruleEngine.listRuleSets().then(setRuleSets).catch(() => setRuleSets([]));
  }, []);

  useEffect(() => {
    if (selectedWorkflowId) loadSteps(selectedWorkflowId);
  }, [selectedWorkflowId]);

  const applyTemplate = (templateCode: string) => {
    if (templateCode === CUSTOM_TEMPLATE) {
      setForm(current => ({ ...current, templateCode }));
      return;
    }
    const template = WORKFLOW_STEP_TEMPLATES.find(item => item.code === templateCode);
    if (!template) return;
    setForm({
      templateCode,
      code: template.code,
      name: template.name,
      sort_order: String(template.sort_order || nextSortOrder),
      ai_enabled: template.ai_enabled,
      manual_approval_required: template.manual_approval_required,
      rule_set_id: template.rule_set_id || '',
    });
  };

  const openCreateModal = () => {
    setForm(defaultForm(nextSortOrder));
    setModalOpen(true);
    setMessage('');
    setError('');
  };

  const saveStep = async () => {
    if (!versionId) return setError('ไม่พบ workflow version');
    setSaving(true);
    setError('');
    try {
      const created = await workflowEngine.createStep({
        workflowVersionId: versionId,
        code: normalizeStepCode(form.code),
        name: form.name.trim(),
        sort_order: Number(form.sort_order) || nextSortOrder,
        ai_enabled: form.ai_enabled,
        manual_approval_required: form.manual_approval_required,
        rule_set_id: form.rule_set_id || null,
      });
      setModalOpen(false);
      setMessage(`เพิ่มขั้นตอน ${created.name} เรียบร้อย`);
      await loadSteps(selectedWorkflowId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เพิ่มขั้นตอนไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const persistOrder = async (ordered: WorkflowStepDef[]) => {
    if (!versionId) return;
    setReordering(true);
    setError('');
    try {
      const next = await workflowEngine.reorderSteps(versionId, ordered.map(step => step.id));
      setSteps(next);
      setMessage('จัดลำดับขั้นตอนเรียบร้อย');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'จัดลำดับไม่สำเร็จ');
      await loadSteps(selectedWorkflowId);
    } finally {
      setReordering(false);
    }
  };

  const onDragStart = (stepId: string) => setDragId(stepId);

  const onDropOn = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const from = steps.findIndex(step => step.id === dragId);
    const to = steps.findIndex(step => step.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSteps(next);
    await persistOrder(next);
  };

  if (loading && !steps.length && !workflows.length) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  }

  return (
    <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-6">
      <Card className="p-5 h-fit">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold">Workflows</h2>
        </div>
        <div className="space-y-3">
          {workflows.map(workflow => (
            <button
              key={workflow.id}
              onClick={() => setSelectedWorkflowId(workflow.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedWorkflowId === workflow.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{workflow.name}</p>
                <Badge variant={workflow.is_active ? 'success' : 'neutral'}>{workflow.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-xs text-neutral-500 mt-2">{workflow.description || '-'}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold">ขั้นตอน Workflow</h2>
            {versionId && <p className="text-xs text-neutral-500 mt-1">Version: {versionId} • ลากเพื่อจัดลำดับ</p>}
          </div>
          <button type="button" className="btn-primary" onClick={openCreateModal} disabled={!versionId}>
            <Plus className="w-4 h-4" /> เพิ่มขั้นตอน
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : steps.length === 0 ? (
          <div className="text-center py-12 text-sm text-neutral-500">
            ยังไม่มีขั้นตอน — กด <strong>เพิ่มขั้นตอน</strong> เพื่อเริ่มต้น
          </div>
        ) : (
          <div className="relative space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`relative flex gap-4 ${dragId === step.id ? 'opacity-60' : ''}`}
                draggable={!reordering}
                onDragStart={() => onDragStart(step.id)}
                onDragOver={event => event.preventDefault()}
                onDrop={() => onDropOn(step.id)}
              >
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold">{index + 1}</div>
                  {index < steps.length - 1 && <div className="w-px flex-1 bg-neutral-200 min-h-8" />}
                </div>
                <div className="flex-1 border border-neutral-200 rounded-lg p-3 mb-2 bg-white cursor-grab active:cursor-grabbing">
                  <div className="flex flex-wrap items-center gap-2">
                    <GripVertical className="w-4 h-4 text-neutral-400" />
                    <p className="font-medium text-sm flex-1">{step.name}</p>
                    <Badge variant="neutral">{step.code}</Badge>
                    <Badge variant="neutral">#{step.sort_order}</Badge>
                    {step.ai_enabled && <Badge variant="primary"><Bot className="w-3 h-3 mr-1" /> AI</Badge>}
                    {step.manual_approval_required && <Badge variant="warning"><UserCheck className="w-3 h-3 mr-1" /> ต้องอนุมัติ</Badge>}
                    {!step.ai_enabled && !step.manual_approval_required && <CheckCircle2 className="w-4 h-4 text-success-500" />}
                  </div>
                  {step.rule_set_id && <p className="text-xs text-neutral-500 mt-2">Rule Set: {step.rule_set_id}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {reordering && <p className="text-sm text-neutral-500 mt-4">กำลังบันทึกลำดับ...</p>}
        {message && <p className="text-sm text-success-600 mt-4">{message}</p>}
        {error && !modalOpen && <p className="text-sm text-error-600 mt-4">{error}</p>}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="เพิ่มขั้นตอน Workflow" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">แม่แบบขั้นตอน</label>
            <select className="input" value={form.templateCode} onChange={event => applyTemplate(event.target.value)}>
              {templateOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-xs text-neutral-500 mt-1">เลือกแม่แบบมาตรฐาน หรือกำหนดเองเพื่อสร้างขั้นตอนใหม่</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">รหัสขั้นตอน (Code)</label>
              <input
                className="input font-mono text-xs"
                value={form.code}
                onChange={event => setForm(current => ({ ...current, code: event.target.value }))}
                placeholder="เช่น QUALITY_CHECK"
              />
            </div>
            <div>
              <label className="label">ชื่อขั้นตอน</label>
              <input className="input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
            </div>
            <div>
              <label className="label">ลำดับ (Sort Order)</label>
              <input className="input" type="number" min="1" step="10" value={form.sort_order} onChange={event => setForm(current => ({ ...current, sort_order: event.target.value }))} />
            </div>
            <div>
              <label className="label">Rule Set (ถ้ามี)</label>
              <select className="input" value={form.rule_set_id} onChange={event => setForm(current => ({ ...current, rule_set_id: event.target.value }))}>
                <option value="">ไม่ใช้ Rule Set</option>
                {ruleSets.map(ruleSet => (
                  <option key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ai_enabled} onChange={event => setForm(current => ({ ...current, ai_enabled: event.target.checked }))} />
              เปิดใช้ AI ในขั้นตอนนี้
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.manual_approval_required} onChange={event => setForm(current => ({ ...current, manual_approval_required: event.target.checked }))} />
              ต้องอนุมัติด้วยมือ
            </label>
          </div>

          {error && modalOpen && <p className="text-sm text-error-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>ยกเลิก</button>
            <button type="button" className="btn-primary" onClick={saveStep} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึกขั้นตอน'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

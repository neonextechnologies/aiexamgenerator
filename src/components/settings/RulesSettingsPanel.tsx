import { useEffect, useMemo, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { Badge, Card, Modal, Spinner } from '../ui';
import { useAuth } from '../../lib/auth';
import { ruleEngine } from '../../services';
import { normalizeRuleCode, RULE_SCOPES, RULE_SEVERITIES, RULE_TEMPLATES, RULE_TYPES } from '../../lib/rule-catalog';
import type { Rule, RuleScope, RuleSet, RuleSeverity } from '../../types/v2';

const CUSTOM_TEMPLATE = '__custom__';

interface RuleFormState {
  templateCode: string;
  code: string;
  name: string;
  description: string;
  scope: RuleScope;
  priority: string;
  rule_type: string;
  severity: RuleSeverity;
  is_blocking: boolean;
  is_active: boolean;
  condition_json: string;
  action_json: string;
}

function defaultForm(): RuleFormState {
  return {
    templateCode: CUSTOM_TEMPLATE,
    code: '',
    name: '',
    description: '',
    scope: 'GENERATION',
    priority: '100',
    rule_type: 'custom',
    severity: 'warning',
    is_blocking: false,
    is_active: true,
    condition_json: '{}',
    action_json: '{}',
  };
}

function parseJsonField(value: string, fieldName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${fieldName} ต้องเป็น JSON object ที่ถูกต้อง`);
  }
}

export function RulesSettingsPanel() {
  const { user } = useAuth();
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedSet, setSelectedSet] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RuleFormState>(defaultForm);

  const loadRuleSets = async () => {
    const sets = await ruleEngine.listRuleSets();
    setRuleSets(sets);
    if (!selectedSet && sets[0]?.id) setSelectedSet(sets[0].id);
    return sets;
  };

  const loadRules = async (ruleSetId: string) => {
    if (!ruleSetId) return setRules([]);
    setLoading(true);
    setError('');
    try {
      setRules(await ruleEngine.getRulesForSet(ruleSetId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดกฎไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuleSets()
      .then(sets => {
        const first = sets[0]?.id || '';
        if (first) setSelectedSet(first);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'โหลดชุดกฎไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedSet) loadRules(selectedSet);
  }, [selectedSet]);

  const templateOptions = useMemo(() => [
    { value: CUSTOM_TEMPLATE, label: 'กำหนดเอง' },
    ...RULE_TEMPLATES.map(template => ({ value: template.code, label: template.name })),
  ], []);

  const applyTemplate = (templateCode: string) => {
    if (templateCode === CUSTOM_TEMPLATE) {
      setForm(current => ({ ...current, templateCode }));
      return;
    }
    const template = RULE_TEMPLATES.find(item => item.code === templateCode);
    if (!template) return;
    setForm({
      templateCode,
      code: template.code,
      name: template.name,
      description: template.description,
      scope: template.scope,
      priority: String(template.priority),
      rule_type: template.rule_type,
      severity: template.severity,
      is_blocking: template.is_blocking,
      is_active: true,
      condition_json: JSON.stringify(template.condition_json, null, 2),
      action_json: JSON.stringify(template.action_json, null, 2),
    });
  };

  const openCreateModal = () => {
    setForm(defaultForm());
    setModalOpen(true);
    setMessage('');
    setError('');
  };

  const saveRule = async () => {
    if (!selectedSet) return setError('กรุณาเลือก Rule Set');
    setSaving(true);
    setError('');
    try {
      const created = await ruleEngine.createRule({
        ruleSetId: selectedSet,
        code: normalizeRuleCode(form.code),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        scope: form.scope,
        priority: Number(form.priority) || 100,
        rule_type: form.rule_type,
        severity: form.severity,
        is_blocking: form.is_blocking,
        is_active: form.is_active,
        condition_json: parseJsonField(form.condition_json, 'Condition JSON'),
        action_json: parseJsonField(form.action_json, 'Action JSON'),
        createdBy: user?.id,
      });
      setModalOpen(false);
      setMessage(`เพิ่มกฎ ${created.name} เรียบร้อย`);
      await loadRules(selectedSet);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เพิ่มกฎไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
      <Card className="p-4 h-fit">
        <h2 className="font-semibold mb-3">Rule Sets</h2>
        <div className="space-y-2">
          {ruleSets.map(ruleSet => (
            <button
              key={ruleSet.id}
              onClick={() => setSelectedSet(ruleSet.id)}
              className={`w-full text-left p-3 rounded-lg border ${selectedSet === ruleSet.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{ruleSet.name}</span>
                <Badge variant={ruleSet.is_active ? 'success' : 'neutral'}>{ruleSet.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-xs text-neutral-500 mt-1">{ruleSet.scope}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold">Rules</h2>
          </div>
          <button type="button" className="btn-primary" onClick={openCreateModal} disabled={!selectedSet}>
            <Plus className="w-4 h-4" /> เพิ่มกฎ
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-sm text-neutral-500">
            ยังไม่มีกฎในชุดนี้ — กด <strong>เพิ่มกฎ</strong> เพื่อเริ่มต้น
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="border border-neutral-200 rounded-lg p-4">
                <div className="flex flex-wrap gap-2 items-start">
                  <div className="flex-1 min-w-56">
                    <p className="font-semibold text-sm">{rule.name}</p>
                    <p className="font-mono text-xs text-neutral-500 mt-1">{rule.code}</p>
                    {rule.description && <p className="text-sm text-neutral-500 mt-2">{rule.description}</p>}
                  </div>
                  <Badge variant="neutral">{rule.scope}</Badge>
                  <Badge variant={rule.severity === 'critical' || rule.severity === 'error' ? 'error' : rule.severity === 'warning' ? 'warning' : 'primary'}>{rule.severity}</Badge>
                  <Badge variant={rule.is_active ? 'success' : 'neutral'}>{rule.is_active ? 'Active' : 'Inactive'}</Badge>
                  {rule.is_locked && <Badge variant="neutral">Locked</Badge>}
                </div>
                <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-neutral-100 text-xs text-neutral-500">
                  <span>Priority: <strong className="text-neutral-700">{rule.priority}</strong></span>
                  <span>Type: <strong className="text-neutral-700">{rule.rule_type}</strong></span>
                  <span>Blocking: <strong className={rule.is_blocking ? 'text-error-600' : 'text-neutral-700'}>{rule.is_blocking ? 'Yes' : 'No'}</strong></span>
                  <span>Version: <strong className="text-neutral-700">{rule.version}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}

        {message && <p className="text-sm text-success-600 mt-4">{message}</p>}
        {error && !modalOpen && <p className="text-sm text-error-600 mt-4">{error}</p>}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="เพิ่มกฎควบคุม" size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">แม่แบบกฎ</label>
            <select className="input" value={form.templateCode} onChange={event => applyTemplate(event.target.value)}>
              {templateOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-xs text-neutral-500 mt-1">เลือกแม่แบบเพื่อเติมค่าเริ่มต้น หรือเลือก "กำหนดเอง" เพื่อสร้างกฎใหม่</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">รหัสกฎ (Code)</label>
              <input
                className="input font-mono text-xs"
                value={form.code}
                onChange={event => setForm(current => ({ ...current, code: event.target.value }))}
                placeholder="เช่น MIN_MARKS_1"
              />
            </div>
            <div>
              <label className="label">ชื่อกฎ</label>
              <input className="input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="label">คำอธิบาย</label>
              <textarea className="input min-h-20" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
            </div>
            <div>
              <label className="label">ขอบเขต (Scope)</label>
              <select className="input" value={form.scope} onChange={event => setForm(current => ({ ...current, scope: event.target.value as RuleScope }))}>
                {RULE_SCOPES.map(scope => <option key={scope} value={scope}>{scope}</option>)}
              </select>
            </div>
            <div>
              <label className="label">ประเภทกฎ</label>
              <select className="input" value={form.rule_type} onChange={event => setForm(current => ({ ...current, rule_type: event.target.value }))}>
                {RULE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <label className="label">ลำดับความสำคัญ (Priority)</label>
              <input className="input" type="number" min="1" value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value }))} />
            </div>
            <div>
              <label className="label">ระดับความรุนแรง</label>
              <select className="input" value={form.severity} onChange={event => setForm(current => ({ ...current, severity: event.target.value as RuleSeverity }))}>
                {RULE_SEVERITIES.map(severity => <option key={severity} value={severity}>{severity}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_blocking} onChange={event => setForm(current => ({ ...current, is_blocking: event.target.checked }))} />
              บล็อกเมื่อละเมิด (Blocking)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={event => setForm(current => ({ ...current, is_active: event.target.checked }))} />
              เปิดใช้งานทันที
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Condition JSON</label>
              <textarea className="input min-h-28 font-mono text-xs" value={form.condition_json} onChange={event => setForm(current => ({ ...current, condition_json: event.target.value }))} />
            </div>
            <div>
              <label className="label">Action JSON</label>
              <textarea className="input min-h-28 font-mono text-xs" value={form.action_json} onChange={event => setForm(current => ({ ...current, action_json: event.target.value }))} />
            </div>
          </div>

          {error && modalOpen && <p className="text-sm text-error-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>ยกเลิก</button>
            <button type="button" className="btn-primary" onClick={saveRule} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึกกฎ'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

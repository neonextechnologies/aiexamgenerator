import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Eye, EyeOff, Plug, RefreshCw, Save, Sparkles } from 'lucide-react';
import { Badge, Card, Spinner } from '../ui';
import { useAuth } from '../../lib/auth';
import { isDemoMode } from '../../lib/supabase';
import { getCatalogEntry, PROVIDER_CATALOG, PROVIDER_TYPE_LABELS } from '../../lib/ai-provider-catalog';
import { aiProviderService, type AIProviderDetails, type SaveAIProviderInput } from '../../services/ai-providers';
import type { ProviderType } from '../../types/v2';

const PROVIDER_ICONS: Record<string, typeof Bot> = {
  'prov-demo': Sparkles,
  'prov-openai': Bot,
  'prov-anthropic': Bot,
  'prov-gemini': Sparkles,
  'prov-compat': Plug,
};

interface FormState {
  name: string;
  provider_type: ProviderType;
  is_enabled: boolean;
  base_url: string;
  default_model: string;
  generation_model: string;
  analysis_model: string;
  verification_model: string;
  embedding_model: string;
  temperature: string;
  max_tokens: string;
  timeout_ms: string;
  daily_limit: string;
  monthly_budget_usd: string;
  api_key: string;
}

function toForm(provider: AIProviderDetails): FormState {
  return {
    name: provider.name,
    provider_type: provider.provider_type,
    is_enabled: provider.is_enabled,
    base_url: provider.base_url || '',
    default_model: provider.default_model || '',
    generation_model: provider.generation_model || '',
    analysis_model: provider.analysis_model || '',
    verification_model: provider.verification_model || '',
    embedding_model: provider.embedding_model || '',
    temperature: String(provider.temperature ?? 0.3),
    max_tokens: String(provider.max_tokens ?? 8000),
    timeout_ms: String(provider.timeout_ms ?? 120000),
    daily_limit: provider.daily_limit != null ? String(provider.daily_limit) : '',
    monthly_budget_usd: provider.monthly_budget_usd != null ? String(provider.monthly_budget_usd) : '',
    api_key: '',
  };
}

function ModelField({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" list={`${label}-models`} value={value} onChange={event => onChange(event.target.value)} placeholder="ระบุชื่อ model" />
      {suggestions.length > 0 && (
        <datalist id={`${label}-models`}>
          {suggestions.map(model => <option key={model} value={model} />)}
        </datalist>
      )}
    </div>
  );
}

export function AIProvidersSettingsPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'academic_admin' || user?.role === 'system_admin';
  const [providers, setProviders] = useState<AIProviderDetails[]>([]);
  const [selectedId, setSelectedId] = useState('prov-openai');
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selected = useMemo(() => providers.find(provider => provider.id === selectedId), [providers, selectedId]);
  const catalog = useMemo(() => getCatalogEntry(selectedId), [selectedId]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await aiProviderService.listProviders();
      setProviders(rows);
      const active = rows.find(provider => provider.is_enabled) || rows[0];
      const nextId = rows.some(provider => provider.id === selectedId) ? selectedId : (active?.id || 'prov-openai');
      setSelectedId(nextId);
      const nextProvider = rows.find(provider => provider.id === nextId) || rows[0];
      if (nextProvider) setForm(toForm(nextProvider));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลด AI Provider ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectProvider = (id: string) => {
    setSelectedId(id);
    const provider = providers.find(item => item.id === id);
    if (provider) {
      setForm(toForm(provider));
      setMessage('');
      setError('');
      setShowKey(false);
    }
  };

  const patchForm = (patch: Partial<FormState>) => {
    setForm(current => current ? { ...current, ...patch } : current);
  };

  const buildSaveInput = (): SaveAIProviderInput | null => {
    if (!form) return null;
    return {
      id: selectedId,
      name: form.name.trim(),
      provider_type: form.provider_type,
      is_enabled: form.is_enabled,
      base_url: form.base_url.trim() || null,
      default_model: form.default_model.trim() || null,
      generation_model: form.generation_model.trim() || null,
      analysis_model: form.analysis_model.trim() || null,
      verification_model: form.verification_model.trim() || null,
      embedding_model: form.embedding_model.trim() || null,
      temperature: Number(form.temperature) || 0.3,
      max_tokens: Number(form.max_tokens) || 8000,
      timeout_ms: Number(form.timeout_ms) || 120000,
      daily_limit: form.daily_limit.trim() ? Number(form.daily_limit) : null,
      monthly_budget_usd: form.monthly_budget_usd.trim() ? Number(form.monthly_budget_usd) : null,
      api_key: form.api_key.trim() || undefined,
    };
  };

  const save = async () => {
    if (!isAdmin) return setError('เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขได้');
    const input = buildSaveInput();
    if (!input?.name) return setError('กรุณาระบุชื่อ Provider');
    if (catalog?.requires_api_key && !selected?.has_api_key && !input.api_key) {
      return setError('กรุณาใส่ API key');
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await aiProviderService.saveProvider(input);
      setProviders(current => current.map(provider => provider.id === saved.id ? saved : provider));
      setForm(toForm(saved));
      setMessage('บันทึกการตั้งค่าเรียบร้อย');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setError('');
    setMessage('');
    try {
      const result = await aiProviderService.testProvider(selectedId, form?.api_key);
      if (result.ok) setMessage(result.message);
      else setError(result.message);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ทดสอบไม่สำเร็จ');
    } finally {
      setTesting(false);
    }
  };

  const setAsDefault = async () => {
    if (!isAdmin) return setError('เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขได้');
    setSaving(true);
    setError('');
    try {
      const input = buildSaveInput();
      if (input) await aiProviderService.saveProvider({ ...input, is_enabled: true });
      await aiProviderService.setDefaultProvider(selectedId);
      setMessage('ตั้งเป็น Provider หลักแล้ว');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ตั้งค่าเริ่มต้นไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const resetToPreset = () => {
    const preset = getCatalogEntry(selectedId);
    if (!preset || !selected) return;
    setForm({
      ...toForm(selected),
      name: preset.name,
      provider_type: preset.provider_type,
      base_url: preset.base_url,
      default_model: preset.default_model,
      generation_model: preset.generation_model,
      analysis_model: preset.analysis_model,
      verification_model: preset.verification_model,
      embedding_model: preset.embedding_model,
      temperature: String(preset.temperature),
      max_tokens: String(preset.max_tokens),
      timeout_ms: String(preset.timeout_ms),
    });
    setMessage('โหลดค่าเริ่มต้นของผู้ให้บริการแล้ว — กดบันทึกเพื่อยืนยัน');
  };

  if (loading || !form || !catalog) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  }

  const Icon = PROVIDER_ICONS[selectedId] || Plug;

  return (
    <div className="space-y-4">
      {isDemoMode && (
        <div className="p-4 rounded-lg bg-warning-50 border border-warning-200 flex gap-2">
          <AlertCircle className="w-4 h-4 text-warning-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-warning-700">Demo Mode</p>
            <p className="text-warning-600 mt-1">การตั้งค่าจะบันทึกในเครื่อง (localStorage) จนกว่าจะเชื่อมต่อ Supabase</p>
          </div>
        </div>
      )}

      {!isAdmin && (
        <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 text-sm text-neutral-600">
          คุณสามารถดูการตั้งค่าได้ แต่เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไข API key และบันทึกได้
        </div>
      )}

      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
        <Card className="p-4 h-fit">
          <h2 className="font-semibold mb-3">เลือกผู้ให้บริการ AI</h2>
          <div className="space-y-2">
            {PROVIDER_CATALOG.map(entry => {
              const provider = providers.find(item => item.id === entry.id);
              const EntryIcon = PROVIDER_ICONS[entry.id] || Plug;
              return (
                <button
                  key={entry.id}
                  onClick={() => selectProvider(entry.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedId === entry.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                      <EntryIcon className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{entry.name}</span>
                        {provider?.is_enabled && <Badge variant="success">หลัก</Badge>}
                      </div>
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{entry.description}</p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        <Badge variant="neutral">{PROVIDER_TYPE_LABELS[entry.provider_type]}</Badge>
                        {provider?.has_api_key && <Badge variant="primary">มี API key</Badge>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-48">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-lg">{form.name}</h2>
                <Badge variant={form.is_enabled ? 'success' : 'neutral'}>{form.is_enabled ? 'เปิดใช้งาน' : 'ปิด'}</Badge>
                {selected?.last_test_status && (
                  <Badge variant={selected.last_test_status === 'ok' || selected.last_test_status === 'key_present' ? 'success' : 'warning'}>
                    {selected.last_test_status}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-neutral-500 mt-1">{catalog.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={resetToPreset} disabled={!isAdmin} className="btn-secondary">
                <RefreshCw className="w-4 h-4" /> ค่าเริ่มต้น
              </button>
              <button type="button" onClick={testConnection} disabled={testing || !isAdmin} className="btn-secondary">
                {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
              </button>
              <button type="button" onClick={setAsDefault} disabled={saving || !isAdmin} className="btn-secondary">
                ตั้งเป็นหลัก
              </button>
              <button type="button" onClick={save} disabled={saving || !isAdmin} className="btn-primary">
                <Save className="w-4 h-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">ชื่อที่แสดง</label>
              <input className="input" value={form.name} disabled={!isAdmin} onChange={event => patchForm({ name: event.target.value })} />
            </div>
            <div>
              <label className="label">ประเภท</label>
              <input className="input bg-neutral-50" value={PROVIDER_TYPE_LABELS[form.provider_type]} disabled />
            </div>

            <div className="md:col-span-2 flex items-center gap-3 p-3 rounded-lg border border-neutral-200">
              <input
                id="provider-enabled"
                type="checkbox"
                className="rounded border-neutral-300"
                checked={form.is_enabled}
                disabled={!isAdmin}
                onChange={event => patchForm({ is_enabled: event.target.checked })}
              />
              <label htmlFor="provider-enabled" className="text-sm">
                <span className="font-medium">เปิดใช้งาน Provider นี้</span>
                <span className="block text-neutral-500 text-xs mt-0.5">Provider ที่เปิดใช้งานจะถูกเลือกในหน้าสร้างข้อสอบ</span>
              </label>
            </div>

            {catalog.requires_base_url && (
              <div className="md:col-span-2">
                <label className="label">Base URL</label>
                <input className="input font-mono text-xs" value={form.base_url} disabled={!isAdmin} onChange={event => patchForm({ base_url: event.target.value })} placeholder="http://localhost:11434/v1" />
              </div>
            )}

            {catalog.requires_api_key && (
              <div className="md:col-span-2">
                <label className="label">API Key</label>
                <div className="relative">
                  <input
                    className="input pr-10 font-mono text-xs"
                    type={showKey ? 'text' : 'password'}
                    value={form.api_key}
                    disabled={!isAdmin}
                    onChange={event => patchForm({ api_key: event.target.value })}
                    placeholder={selected?.has_api_key ? `บันทึกแล้ว ${selected.api_key_hint || ''} — ใส่ค่าใหม่เพื่อเปลี่ยน` : 'sk-... หรือ API key ของผู้ให้บริการ'}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600"
                    onClick={() => setShowKey(current => !current)}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-neutral-500 mt-1">API key จะถูกเก็บแบบเข้ารหัสในระบบ และไม่แสดงกลับมาอีกครั้ง</p>
              </div>
            )}

            <ModelField label="Model หลัก" value={form.default_model} onChange={value => patchForm({ default_model: value })} suggestions={catalog.model_suggestions.generation} />
            <ModelField label="Model สร้างข้อสอบ" value={form.generation_model} onChange={value => patchForm({ generation_model: value })} suggestions={catalog.model_suggestions.generation} />
            <ModelField label="Model วิเคราะห์" value={form.analysis_model} onChange={value => patchForm({ analysis_model: value })} suggestions={catalog.model_suggestions.analysis} />
            <ModelField label="Model ตรวจสอบ" value={form.verification_model} onChange={value => patchForm({ verification_model: value })} suggestions={catalog.model_suggestions.verification} />
            <ModelField label="Model Embedding" value={form.embedding_model} onChange={value => patchForm({ embedding_model: value })} suggestions={catalog.model_suggestions.embedding} />

            <div>
              <label className="label">Temperature</label>
              <input className="input" type="number" min="0" max="2" step="0.1" value={form.temperature} disabled={!isAdmin} onChange={event => patchForm({ temperature: event.target.value })} />
            </div>
            <div>
              <label className="label">Max Tokens</label>
              <input className="input" type="number" min="256" step="256" value={form.max_tokens} disabled={!isAdmin} onChange={event => patchForm({ max_tokens: event.target.value })} />
            </div>
            <div>
              <label className="label">Timeout (ms)</label>
              <input className="input" type="number" min="1000" step="1000" value={form.timeout_ms} disabled={!isAdmin} onChange={event => patchForm({ timeout_ms: event.target.value })} />
            </div>
            <div>
              <label className="label">Daily Limit (คำขอ/วัน)</label>
              <input className="input" type="number" min="0" value={form.daily_limit} disabled={!isAdmin} onChange={event => patchForm({ daily_limit: event.target.value })} placeholder="ไม่จำกัด" />
            </div>
            <div>
              <label className="label">งบประมาณรายเดือน (USD)</label>
              <input className="input" type="number" min="0" step="0.01" value={form.monthly_budget_usd} disabled={!isAdmin} onChange={event => patchForm({ monthly_budget_usd: event.target.value })} placeholder="ไม่จำกัด" />
            </div>
          </div>

          {selected?.last_tested_at && (
            <p className="text-xs text-neutral-500 mt-4 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              ทดสอบล่าสุด: {new Date(selected.last_tested_at).toLocaleString('th-TH')}
            </p>
          )}

          {message && <p className="text-sm text-success-600 mt-4">{message}</p>}
          {error && <p className="text-sm text-error-600 mt-4">{error}</p>}
        </Card>
      </div>
    </div>
  );
}

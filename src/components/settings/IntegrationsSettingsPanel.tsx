import { useEffect, useState } from 'react';
import { Plug, Save } from 'lucide-react';
import { Badge, Card, Spinner } from '../ui';
import { isDemoMode, supabase } from '../../lib/supabase';

export type IntegrationRow = {
  id: string;
  name: string;
  type: string;
  endpoint?: string | null;
  auth_type?: string | null;
  is_active: boolean;
  config_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

const STORAGE_KEY = 'aiexam.integrations';

const DEMO_INTEGRATIONS: IntegrationRow[] = [
  { id: 'int-lms', name: 'LMS Webhook', type: 'lms', endpoint: 'https://lms.example.edu/hooks', auth_type: 'bearer', is_active: false, config_json: {} },
  { id: 'int-mcp', name: 'MCP Knowledge Bridge', type: 'mcp', endpoint: null, auth_type: 'none', is_active: true, config_json: { role: 'knowledge' } },
  { id: 'int-rest', name: 'External REST API', type: 'rest', endpoint: 'https://api.example.com/v1', auth_type: 'api_key', is_active: false, config_json: {} },
];

function readDemo(): IntegrationRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as IntegrationRow[];
  } catch {
    // ignore
  }
  return DEMO_INTEGRATIONS.map(row => ({ ...row }));
}

function writeDemo(rows: IntegrationRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function IntegrationsSettingsPanel() {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<IntegrationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (isDemoMode || !supabase) {
        const demo = readDemo();
        setRows(demo);
        const first = demo[0];
        if (first) {
          setSelectedId(first.id);
          setForm({ ...first });
        }
        return;
      }
      const { data, error: queryError } = await supabase.from('integrations').select('*').order('created_at', { ascending: true });
      if (queryError) throw queryError;
      const list = (data || []) as IntegrationRow[];
      setRows(list.length ? list : DEMO_INTEGRATIONS);
      const first = list[0] || DEMO_INTEGRATIONS[0];
      if (first) {
        setSelectedId(first.id);
        setForm({ ...first });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลด integrations ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const selected = rows.find(row => row.id === selectedId);
    if (selected) setForm({ ...selected });
  }, [selectedId, rows]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        endpoint: form.endpoint?.trim() || null,
        auth_type: form.auth_type?.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (isDemoMode || !supabase) {
        const next = rows.map(row => (row.id === payload.id ? payload : row));
        if (!next.some(row => row.id === payload.id)) next.push(payload);
        writeDemo(next);
        setRows(next);
        setMessage('บันทึกแล้ว (โหมดสาธิต — localStorage)');
        return;
      }
      const { data, error: upsertError } = await supabase.from('integrations').upsert(payload).select('*').single();
      if (upsertError) throw upsertError;
      const saved = data as IntegrationRow;
      setRows(current => {
        const exists = current.some(row => row.id === saved.id);
        return exists ? current.map(row => (row.id === saved.id ? saved : row)) : [...current, saved];
      });
      setMessage('บันทึก integration เรียบร้อย');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
      <Card className="p-5 h-fit">
        <div className="flex items-center gap-2 mb-4">
          <Plug className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold">Integrations</h2>
        </div>
        <div className="space-y-2">
          {rows.map(row => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedId === row.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{row.name}</p>
                <Badge variant={row.is_active ? 'success' : 'neutral'}>{row.is_active ? 'Active' : 'Off'}</Badge>
              </div>
              <p className="text-xs text-neutral-500 mt-1">{row.type}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        {!form ? (
          <p className="text-sm text-neutral-500">เลือก integration เพื่อแก้ไข</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">ชื่อ</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">ประเภท</label>
                <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="mcp">mcp</option>
                  <option value="rest">rest</option>
                  <option value="webhook">webhook</option>
                  <option value="knowledge">knowledge</option>
                  <option value="lms">lms</option>
                </select>
              </div>
              <div>
                <label className="label">Auth Type</label>
                <input className="input" value={form.auth_type || ''} onChange={e => setForm({ ...form, auth_type: e.target.value })} placeholder="bearer / api_key / none" />
              </div>
            </div>
            <div>
              <label className="label">Endpoint</label>
              <input className="input" value={form.endpoint || ''} onChange={e => setForm({ ...form, endpoint: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              เปิดใช้งาน
            </label>
            {message && <p className="text-sm text-success-600">{message}</p>}
            {error && <p className="text-sm text-error-600">{error}</p>}
            <div className="flex justify-end">
              <button type="button" className="btn-primary" disabled={saving} onClick={save}>
                <Save className="w-4 h-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import { Badge, Card, Modal, Spinner } from '../ui';
import { useAuth } from '../../lib/auth';
import { isDemoMode, supabase } from '../../lib/supabase';

export type ExperimentRow = {
  id: string;
  name: string;
  description?: string | null;
  hypothesis?: string | null;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  provider_id?: string | null;
  control_config?: Record<string, unknown>;
  treatment_config?: Record<string, unknown>;
  metrics_json?: Record<string, unknown>;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

const STORAGE_KEY = 'aiexam.experiments';
const STATUS_LABELS: Record<ExperimentRow['status'], string> = {
  draft: 'ร่าง',
  running: 'กำลังรัน',
  paused: 'หยุดชั่วคราว',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

function readDemo(): ExperimentRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ExperimentRow[];
  } catch {
    // ignore
  }
  return [];
}

function writeDemo(rows: ExperimentRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function ExperimentsSettingsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ExperimentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '', hypothesis: '', status: 'draft' as ExperimentRow['status'] });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (isDemoMode || !supabase) {
        setRows(readDemo());
        return;
      }
      const { data, error: queryError } = await supabase
        .from('experiments')
        .select('*')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setRows((data || []) as ExperimentRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลด experiments ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createExperiment = async () => {
    if (!form.name.trim()) {
      setError('กรุณาระบุชื่อ experiment');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const row: ExperimentRow = {
        id: `exp-${Date.now()}`,
        name: form.name.trim(),
        description: form.description.trim() || null,
        hypothesis: form.hypothesis.trim() || null,
        status: form.status,
        provider_id: null,
        control_config: {},
        treatment_config: {},
        metrics_json: {},
        created_by: user?.id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (isDemoMode || !supabase) {
        const next = [row, ...readDemo()];
        writeDemo(next);
        setRows(next);
      } else {
        const { data, error: insertError } = await supabase.from('experiments').insert(row).select('*').single();
        if (insertError) throw insertError;
        setRows(current => [data as ExperimentRow, ...current]);
      }
      setModalOpen(false);
      setForm({ name: '', description: '', hypothesis: '', status: 'draft' });
      setMessage('สร้าง experiment เรียบร้อย');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'สร้างไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: ExperimentRow['status']) => {
    setError('');
    setMessage('');
    try {
      const updatedAt = new Date().toISOString();
      if (isDemoMode || !supabase) {
        const next = readDemo().map(row => (row.id === id ? { ...row, status, updated_at: updatedAt } : row));
        writeDemo(next);
        setRows(next);
      } else {
        const { data, error: updateError } = await supabase
          .from('experiments')
          .update({ status, updated_at: updatedAt })
          .eq('id', id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        setRows(current => current.map(row => (row.id === id ? (data as ExperimentRow) : row)));
      }
      setMessage(`อัปเดตสถานะเป็น ${STATUS_LABELS[status]}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อัปเดตสถานะไม่สำเร็จ');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary-600" />
            <h2 className="font-semibold">Experiments</h2>
          </div>
          <button type="button" className="btn-primary" onClick={() => { setModalOpen(true); setError(''); }}>
            <Plus className="w-4 h-4" /> สร้าง Experiment
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8 text-center">ยังไม่มี experiment — กดสร้างเพื่อเริ่มต้น</p>
        ) : (
          <div className="space-y-3">
            {rows.map(row => (
              <div key={row.id} className="border border-neutral-200 rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{row.name}</p>
                    {row.description && <p className="text-xs text-neutral-500 mt-1">{row.description}</p>}
                    {row.hypothesis && <p className="text-xs text-neutral-500 mt-1">สมมติฐาน: {row.hypothesis}</p>}
                  </div>
                  <Badge variant={row.status === 'running' ? 'success' : row.status === 'paused' ? 'warning' : 'neutral'}>
                    {STATUS_LABELS[row.status]}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(['draft', 'running', 'paused', 'completed', 'cancelled'] as ExperimentRow['status'][]).map(status => (
                    <button
                      key={status}
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={row.status === status}
                      onClick={() => updateStatus(row.id, status)}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {message && <p className="text-sm text-success-600 mt-4">{message}</p>}
        {error && !modalOpen && <p className="text-sm text-error-600 mt-4">{error}</p>}
      </Card>

      <Modal open={modalOpen} onClose={() => !saving && setModalOpen(false)} title="สร้าง Experiment">
        <div className="space-y-3">
          <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">คำอธิบาย</label><textarea className="input min-h-16" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="label">สมมติฐาน</label><textarea className="input min-h-16" value={form.hypothesis} onChange={e => setForm({ ...form, hypothesis: e.target.value })} /></div>
          <div>
            <label className="label">สถานะเริ่มต้น</label>
            <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ExperimentRow['status'] })}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {error && modalOpen && <p className="text-sm text-error-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => setModalOpen(false)}>ยกเลิก</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={createExperiment}>
              {saving ? 'กำลังบันทึก...' : 'สร้าง'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { FileText, Save } from 'lucide-react';
import { Badge, Card, Spinner } from '../ui';
import { promptService, type PromptTemplate } from '../../services/prompts';

export function PromptsSettingsPanel() {
  const [rows, setRows] = useState<PromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<PromptTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await promptService.list();
      setRows(list);
      const selected = list.find(row => row.id === selectedId) || list[0] || null;
      setSelectedId(selected?.id || '');
      setDraft(selected ? { ...selected } : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลด Prompt Templates ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const select = (id: string) => {
    const row = rows.find(item => item.id === id);
    setSelectedId(id);
    setDraft(row ? { ...row } : null);
    setMessage('');
    setError('');
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await promptService.upsert({
        id: draft.id,
        code: draft.code,
        task_type: draft.task_type,
        name: draft.name,
        system_prompt: draft.system_prompt,
        user_template: draft.user_template,
        version: Number(draft.version) || 1,
        is_active: draft.is_active !== false,
      });
      setRows(current => current.map(row => (row.id === saved.id ? saved : row)));
      setDraft(saved);
      setMessage(`บันทึก ${saved.code} แล้ว`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึก Prompt ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div>
      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold">Prompt Templates</h3>
        </div>
        <p className="text-sm text-neutral-500">
          แก้ไข system prompt และ user template ที่ Edge Function ใช้ตามรหัส (code)
        </p>
      </Card>
      {error && <p className="text-sm text-error-600 mb-3">{error}</p>}
      {message && <p className="text-sm text-success-600 mb-3">{message}</p>}
      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        <Card className="p-3">
          <div className="space-y-1">
            {rows.map(row => (
              <button
                key={row.id}
                onClick={() => select(row.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedId === row.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-neutral-50'}`}
              >
                <p className="font-medium truncate">{row.name}</p>
                <p className="text-xs text-neutral-400 font-mono">{row.code}</p>
              </button>
            ))}
            {!rows.length && <p className="text-sm text-neutral-500 p-2">ยังไม่มี Prompt Templates</p>}
          </div>
        </Card>
        {draft ? (
          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">{draft.name}</h4>
              <Badge variant="neutral">{draft.code}</Badge>
              <Badge variant="primary">{draft.task_type}</Badge>
              <Badge variant="accent">v{draft.version}</Badge>
            </div>
            <div>
              <label className="label">ชื่อ</label>
              <input className="input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div>
              <label className="label">System Prompt</label>
              <textarea
                className="input min-h-40 font-mono text-xs"
                value={draft.system_prompt}
                onChange={event => setDraft({ ...draft, system_prompt: event.target.value })}
              />
            </div>
            <div>
              <label className="label">User Template</label>
              <textarea
                className="input min-h-32 font-mono text-xs"
                value={draft.user_template}
                onChange={event => setDraft({ ...draft, user_template: event.target.value })}
              />
              <p className="text-xs text-neutral-400 mt-1">ตัวแปรเช่น {'{{course}}'}, {'{{evidence}}'}, {'{{message}}'}</p>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={saving} onClick={save}>
                <Save className="w-4 h-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-sm text-neutral-500">เลือก Prompt เพื่อแก้ไข</Card>
        )}
      </div>
    </div>
  );
}

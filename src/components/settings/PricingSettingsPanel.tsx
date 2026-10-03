import { useEffect, useState } from 'react';
import { DollarSign, Save } from 'lucide-react';
import { Badge, Card, Spinner } from '../ui';
import { pricingService, type ModelPricing } from '../../services/pricing';

export function PricingSettingsPanel() {
  const [rows, setRows] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ModelPricing>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await pricingService.list({ includeInactive: true });
      setRows(list);
      setDrafts(Object.fromEntries(list.map(row => [row.id, { ...row }])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลดราคาโมเดลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateDraft = (id: string, patch: Partial<ModelPricing>) => {
    setDrafts(current => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const save = async (id: string) => {
    const row = drafts[id];
    if (!row) return;
    setSavingId(id);
    setError('');
    setMessage('');
    try {
      const saved = await pricingService.upsert({
        id: row.id,
        provider_type: row.provider_type,
        model: row.model,
        input_usd_per_1m: Number(row.input_usd_per_1m),
        output_usd_per_1m: Number(row.output_usd_per_1m),
        embedding_usd_per_1m: row.embedding_usd_per_1m == null || Number.isNaN(Number(row.embedding_usd_per_1m))
          ? null
          : Number(row.embedding_usd_per_1m),
        is_active: row.is_active,
      });
      setRows(current => current.map(item => (item.id === id ? saved : item)));
      setDrafts(current => ({ ...current, [id]: saved }));
      setMessage(`บันทึกราคา ${saved.model} แล้ว`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกราคาไม่สำเร็จ');
    } finally {
      setSavingId('');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div>
      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold">ราคาโมเดล AI</h3>
        </div>
        <p className="text-sm text-neutral-500">
          กำหนดอัตรา USD ต่อ 1 ล้านโทเคน สำหรับประมาณการค่าใช้จ่ายใน usage log
        </p>
      </Card>
      {error && <p className="text-sm text-error-600 mb-3">{error}</p>}
      {message && <p className="text-sm text-success-600 mb-3">{message}</p>}
      <div className="space-y-3">
        {rows.map(row => {
          const draft = drafts[row.id] || row;
          return (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <p className="font-medium">{draft.model}</p>
                <Badge variant="neutral">{draft.provider_type}</Badge>
                <Badge variant={draft.is_active ? 'success' : 'warning'}>{draft.is_active ? 'ใช้งาน' : 'ปิด'}</Badge>
              </div>
              <div className="grid md:grid-cols-4 gap-3">
                <div>
                  <label className="label">Input / 1M</label>
                  <input
                    className="input"
                    type="number"
                    step="0.001"
                    min={0}
                    value={draft.input_usd_per_1m}
                    onChange={event => updateDraft(row.id, { input_usd_per_1m: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Output / 1M</label>
                  <input
                    className="input"
                    type="number"
                    step="0.001"
                    min={0}
                    value={draft.output_usd_per_1m}
                    onChange={event => updateDraft(row.id, { output_usd_per_1m: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <label className="label">Embedding / 1M</label>
                  <input
                    className="input"
                    type="number"
                    step="0.001"
                    min={0}
                    value={draft.embedding_usd_per_1m ?? ''}
                    placeholder="—"
                    onChange={event => updateDraft(row.id, {
                      embedding_usd_per_1m: event.target.value === '' ? null : Number(event.target.value),
                    })}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm mb-2">
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={event => updateDraft(row.id, { is_active: event.target.checked })}
                    />
                    เปิดใช้งาน
                  </label>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button className="btn-primary" disabled={savingId === row.id} onClick={() => save(row.id)}>
                  <Save className="w-4 h-4" /> {savingId === row.id ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </Card>
          );
        })}
        {!rows.length && <p className="text-sm text-neutral-500">ยังไม่มีข้อมูลราคาโมเดล</p>}
      </div>
    </div>
  );
}

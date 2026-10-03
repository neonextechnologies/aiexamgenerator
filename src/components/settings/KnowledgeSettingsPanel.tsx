import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Badge, Card, Spinner } from '../ui';
import { isDemoMode, supabase } from '../../lib/supabase';
import { knowledgeProvider, type KnowledgeHealth } from '../../services/knowledge';

type KnowledgeProviderRow = {
  id: string;
  name: string;
  provider_type: string;
  is_enabled: boolean;
  last_health_at?: string | null;
  last_health_status?: string | null;
  last_health_message?: string | null;
};

export function KnowledgeSettingsPanel() {
  const [providers, setProviders] = useState<KnowledgeProviderRow[]>([]);
  const [health, setHealth] = useState<KnowledgeHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const details = await knowledgeProvider.healthDetails();
      setHealth(details);
      if (isDemoMode || !supabase) {
        setProviders([
          {
            id: 'kp-demo',
            name: 'Lexical Demo Store',
            provider_type: 'lexical',
            is_enabled: true,
            last_health_status: details.ok ? 'ok' : 'error',
            last_health_message: details.message,
            last_health_at: new Date().toISOString(),
          },
        ]);
        return;
      }
      const { data, error: queryError } = await supabase
        .from('knowledge_providers')
        .select('*')
        .order('created_at', { ascending: true });
      if (queryError) throw queryError;
      setProviders((data || []) as KnowledgeProviderRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'โหลด Knowledge Providers ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runBackfill = async () => {
    setBackfilling(true);
    setMessage('');
    setError('');
    try {
      const result = await knowledgeProvider.backfillEmbeddings({ limit: 100 });
      if (result.errors.length && !result.updated) {
        setError(result.errors.join('; '));
      } else {
        setMessage(`Backfill embeddings สำเร็จ ${result.updated} chunks${result.errors.length ? ` (แจ้งเตือน: ${result.errors.join('; ')})` : ''}`);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Backfill ไม่สำเร็จ');
    } finally {
      setBackfilling(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold">Knowledge Provider</h3>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-neutral-100">
            <span className="text-neutral-500">โหมดปัจจุบัน</span>
            <span className="font-medium">{health?.mode || (isDemoMode ? 'demo' : '-')}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-neutral-100">
            <span className="text-neutral-500">สถานะ</span>
            <Badge variant={health?.ok ? 'success' : 'error'}>{health?.ok ? 'Ready' : 'Unavailable'}</Badge>
          </div>
          <div className="flex justify-between py-2 border-b border-neutral-100">
            <span className="text-neutral-500">Chunks / Embedded</span>
            <span className="font-medium">{health?.totalChunks ?? 0} / {health?.embeddedChunks ?? 0}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-neutral-500">ข้อความ</span>
            <span className="font-medium text-right max-w-sm">{health?.message || '-'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className="btn-secondary" onClick={load}><RefreshCw className="w-4 h-4" /> ตรวจสอบอีกครั้ง</button>
          <button type="button" className="btn-primary" disabled={backfilling} onClick={runBackfill}>
            {backfilling ? 'กำลัง Backfill...' : 'Backfill Embeddings'}
          </button>
        </div>
        {message && <p className="text-sm text-success-600 mt-3">{message}</p>}
        {error && <p className="text-sm text-error-600 mt-3">{error}</p>}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-4">รายการ Knowledge Providers</h3>
        <div className="space-y-3">
          {providers.map(provider => (
            <div key={provider.id} className="border border-neutral-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{provider.name}</p>
                <p className="text-xs text-neutral-500 mt-1">{provider.provider_type} • {provider.last_health_message || 'ยังไม่มีข้อมูล health'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={provider.is_enabled ? 'success' : 'neutral'}>{provider.is_enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Badge variant={provider.last_health_status === 'ok' || provider.last_health_status === 'ready' ? 'success' : provider.last_health_status ? 'warning' : 'neutral'}>
                  {provider.last_health_status || 'unknown'}
                </Badge>
              </div>
            </div>
          ))}
          {!providers.length && <p className="text-sm text-neutral-500">ยังไม่มี knowledge providers</p>}
        </div>
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Mail, Search } from 'lucide-react';
import { Card, PageHeader, Badge, Tabs } from '../components/ui';
import { RulesSettingsPanel } from '../components/settings/RulesSettingsPanel';
import { WorkflowsSettingsPanel } from '../components/settings/WorkflowsSettingsPanel';
import { UsageSettingsPanel } from '../components/settings/UsageSettingsPanel';
import { AIProvidersSettingsPanel } from '../components/settings/AIProvidersSettingsPanel';
import { useAuth } from '../lib/auth';
import { isDemoMode } from '../lib/supabase';
import { getEmailProvider, getEmailStatus, knowledgeProvider } from '../services';
import { ROLE_LABELS } from '../types';

const WIDE_TABS = new Set(['ai', 'rules', 'workflows', 'usage']);

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.role === 'academic_admin' || user?.role === 'system_admin';

  const tabs = useMemo(() => {
    const items = [
      { id: 'profile', label: 'โปรไฟล์' },
      { id: 'ai', label: 'AI Provider' },
      { id: 'knowledge', label: 'Knowledge' },
      { id: 'email', label: 'อีเมล' },
    ];
    if (isAdmin) {
      items.push(
        { id: 'rules', label: 'กฎควบคุม' },
        { id: 'workflows', label: 'เวิร์กโฟลว์' },
        { id: 'usage', label: 'AI Usage' },
      );
    }
    items.push({ id: 'system', label: 'ระบบ' });
    return items;
  }, [isAdmin]);

  const requestedTab = searchParams.get('tab') || 'profile';
  const normalizedTab = requestedTab === 'providers' ? 'ai' : requestedTab;
  const tab = tabs.some(t => t.id === normalizedTab) ? normalizedTab : 'profile';

  const [knowledgeReady, setKnowledgeReady] = useState<boolean | null>(null);
  const [emailResult, setEmailResult] = useState('');
  const [emailStatus, setEmailStatus] = useState('กำลังตรวจสอบผู้ให้บริการอีเมล...');
  const supabaseConfigured = !isDemoMode;

  useEffect(() => {
    if (requestedTab !== tab) {
      setSearchParams({ tab }, { replace: true });
    }
  }, [requestedTab, tab, setSearchParams]);

  useEffect(() => {
    knowledgeProvider.healthCheck().then(setKnowledgeReady).catch(() => setKnowledgeReady(false));
    getEmailStatus().then(status => setEmailStatus(status.message)).catch(() => setEmailStatus('ไม่สามารถตรวจสอบผู้ให้บริการอีเมลได้'));
  }, []);

  const setTab = (nextTab: string) => {
    setSearchParams({ tab: nextTab }, { replace: true });
  };

  return (
    <div>
      <PageHeader title="ตั้งค่า" description="จัดการบัญชีและการตั้งค่าระบบ" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className={`mt-6 ${WIDE_TABS.has(tab) ? 'max-w-6xl' : 'max-w-2xl'}`}>
        {tab === 'profile' && (
          <Card className="p-5">
            <div className="flex items-center gap-4 mb-6"><div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center text-2xl font-semibold text-primary-700">{user?.full_name?.charAt(0) || 'U'}</div><div><h3 className="font-semibold text-neutral-900">{user?.full_name}</h3><p className="text-sm text-neutral-500">{user?.email}</p><Badge variant="primary">{user ? ROLE_LABELS[user.role] : ''}</Badge></div></div>
            <div className="space-y-3 text-sm"><div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">แผนก</span><span className="font-medium">{user?.department || '-'}</span></div><div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">บัญชีสร้างเมื่อ</span><span className="font-medium">{new Date(user?.created_at || '').toLocaleDateString('th-TH')}</span></div></div>
          </Card>
        )}
        {tab === 'ai' && <AIProvidersSettingsPanel />}
        {tab === 'knowledge' && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4"><Search className="w-5 h-5 text-primary-600" /><h3 className="font-semibold">Knowledge Provider</h3></div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Provider</span><span className="font-medium">{isDemoMode ? 'Lexical Demo Store' : 'Supabase pgvector'}</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">สถานะ</span><Badge variant={knowledgeReady ? 'success' : knowledgeReady === false ? 'error' : 'neutral'}>{knowledgeReady ? 'Ready' : knowledgeReady === false ? 'Unavailable' : 'Checking'}</Badge></div>
              <div className="flex justify-between py-2"><span className="text-neutral-500">Knowledge Bounded</span><Badge variant="success">Supported</Badge></div>
            </div>
          </Card>
        )}
        {tab === 'email' && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4"><Mail className="w-5 h-5 text-primary-600" /><h3 className="font-semibold">Email Provider</h3></div>
            <div className={`p-4 rounded-lg border ${isDemoMode ? 'bg-warning-50 border-warning-200' : 'bg-neutral-50 border-neutral-200'}`}>
              <p className={`text-sm font-medium ${isDemoMode ? 'text-warning-700' : 'text-neutral-800'}`}>{isDemoMode ? 'โหมดสาธิต' : 'ผู้ให้บริการอีเมล'}</p>
              <p className={`text-xs mt-1 ${isDemoMode ? 'text-warning-600' : 'text-neutral-500'}`}>{emailStatus}</p>
            </div>
            <button className="btn-secondary mt-4" onClick={async () => setEmailResult((await getEmailProvider().testConnection()).message)}>ทดสอบการเชื่อมต่อ</button>
            {emailResult && <p className="text-sm text-success-600 mt-3">{emailResult}</p>}
          </Card>
        )}
        {tab === 'rules' && isAdmin && <RulesSettingsPanel />}
        {tab === 'workflows' && isAdmin && <WorkflowsSettingsPanel />}
        {tab === 'usage' && isAdmin && <UsageSettingsPanel />}
        {tab === 'system' && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4"><Database className="w-5 h-5 text-primary-600" /><h3 className="font-semibold">System Status</h3></div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Database</span><Badge variant={supabaseConfigured ? 'success' : 'warning'}>{supabaseConfigured ? 'Connected' : 'Demo (in-memory)'}</Badge></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Authentication</span><Badge variant={supabaseConfigured ? 'success' : 'warning'}>{supabaseConfigured ? 'Supabase Auth' : 'Demo login'}</Badge></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">AI Provider</span><Badge variant={isDemoMode ? 'warning' : 'success'}>{isDemoMode ? 'โหมดสาธิต' : 'Edge (ตามผู้ให้บริการที่เปิดใช้)'}</Badge></div>
              <div className="flex justify-between py-2"><span className="text-neutral-500">Storage</span><Badge variant={supabaseConfigured ? 'success' : 'warning'}>{supabaseConfigured ? 'course-documents' : 'Demo'}</Badge></div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
import { Brain, Database, AlertCircle } from 'lucide-react';
import { Card, PageHeader, Badge, Tabs } from '../components/ui';
import { useAuth } from '../lib/auth';
import { isDemoMode } from '../lib/supabase';
import { ROLE_LABELS } from '../types';
import { useState } from 'react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('profile');
  const tabs = [{ id: 'profile', label: 'โปรไฟล์' }, { id: 'ai', label: 'AI Configuration' }, { id: 'system', label: 'System' }];

  return (
    <div>
      <PageHeader title="ตั้งค่า" description="จัดการบัญชีและการตั้งค่าระบบ" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-6 max-w-2xl">
        {tab === 'profile' && (
          <Card className="p-5">
            <div className="flex items-center gap-4 mb-6"><div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center text-2xl font-semibold text-primary-700">{user?.full_name?.charAt(0) || 'U'}</div><div><h3 className="font-semibold text-neutral-900">{user?.full_name}</h3><p className="text-sm text-neutral-500">{user?.email}</p><Badge variant="primary">{user ? ROLE_LABELS[user.role] : ''}</Badge></div></div>
            <div className="space-y-3 text-sm"><div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">แผนก</span><span className="font-medium">{user?.department || '-'}</span></div><div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">บัญชีสร้างเมื่อ</span><span className="font-medium">{new Date(user?.created_at || '').toLocaleDateString('th-TH')}</span></div></div>
          </Card>
        )}
        {tab === 'ai' && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4"><Brain className="w-5 h-5 text-primary-600" /><h3 className="font-semibold">AI Provider</h3></div>
            {isDemoMode ? (
              <div className="p-4 rounded-lg bg-warning-50 border border-warning-200"><div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-warning-600" /><p className="text-sm font-medium text-warning-700">Demo AI Mode</p></div><p className="text-xs text-warning-600 mt-2">ระบบใช้ DemoAIProvider ไม่เรียก AI จริง ตั้งค่า OPENAI_API_KEY ใน Bolt Secrets เพื่อใช้ AI จริง</p></div>
            ) : (<div className="p-4 rounded-lg bg-success-50 border border-success-200"><p className="text-sm font-medium text-success-700">OpenAI Provider Active</p></div>)}
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Provider</span><Badge variant={isDemoMode ? 'warning' : 'success'}>{isDemoMode ? 'demo' : 'openai'}</Badge></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Question Model</span><span className="font-mono text-xs">{isDemoMode ? 'demo-model' : 'gpt-4o'}</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Max Questions/Request</span><span className="font-medium">30</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Daily User Limit</span><span className="font-medium">50</span></div>
              <div className="flex justify-between py-2"><span className="text-neutral-500">Monthly Budget</span><span className="font-medium">$100</span></div>
            </div>
          </Card>
        )}
        {tab === 'system' && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4"><Database className="w-5 h-5 text-primary-600" /><h3 className="font-semibold">System Status</h3></div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Database</span><Badge variant="success">Connected</Badge></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Authentication</span><Badge variant="success">Active</Badge></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">AI Provider</span><Badge variant={isDemoMode ? 'warning' : 'success'}>{isDemoMode ? 'Demo Mode' : 'Active'}</Badge></div>
              <div className="flex justify-between py-2"><span className="text-neutral-500">Storage</span><Badge variant="success">Active</Badge></div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

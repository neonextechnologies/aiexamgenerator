import { Link } from 'react-router-dom';
import { BookOpen, Sparkles, ClipboardCheck, Library, FileCheck, Activity, TrendingUp, AlertCircle, XCircle } from 'lucide-react';
import { StatCard, Card, PageHeader, Badge } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { isDemoMode } from '../lib/supabase';
import { formatRelativeTime, truncate } from '../lib/utils';
import { QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE, BLOOM_LABELS } from '../types';

export default function DashboardPage() {
  const courses = demoStore.courses;
  const questions = demoStore.questions;
  const blueprints = demoStore.blueprints;
  const usageLogs = demoStore.usageLogs;
  const reviews = demoStore.reviews;

  const pendingReview = questions.filter(q => q.status === 'ready_for_review' || q.status === 'under_review').length;
  const approved = questions.filter(q => q.status === 'approved' || q.status === 'published').length;
  const rejected = questions.filter(q => q.status === 'rejected').length;
  const revision = questions.filter(q => q.status === 'revision_requested').length;
  const todayUsage = usageLogs.filter(u => new Date(u.created_at).toDateString() === new Date().toDateString());
  const todayCost = todayUsage.reduce((s, u) => s + u.estimated_cost_usd, 0);
  const reviewRate = reviews.length > 0 ? Math.round((reviews.filter(r => r.decision === 'approved').length / reviews.length) * 100) : 0;

  const quickActions = [
    { to: '/courses', icon: BookOpen, label: 'สร้างรายวิชา', color: 'primary' },
    { to: '/generate', icon: Sparkles, label: 'สร้างข้อสอบด้วย AI', color: 'accent' },
    { to: '/review', icon: ClipboardCheck, label: 'ตรวจข้อสอบ', color: 'warning' },
    { to: '/exams', icon: FileCheck, label: 'สร้างชุดข้อสอบ', color: 'success' },
  ];

  return (
    <div>
      <PageHeader title="แดชบอร์ด" description="ภาพรวมระบบสร้างและบริหารข้อสอบ" />
      {isDemoMode && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-warning-50 border border-warning-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-warning-600" />
          <p className="text-sm text-warning-700">ระบบกำลังทำงานในโหมด Demo AI — ใช้ข้อมูลตัวอย่าง ไม่เรียก AI จริง</p>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<BookOpen className="w-5 h-5" />} label="รายวิชา" value={courses.length} color="primary" />
        <StatCard icon={<ClipboardCheck className="w-5 h-5" />} label="ข้อสอบรอตรวจ" value={pendingReview} color="warning" />
        <StatCard icon={<Library className="w-5 h-5" />} label="Question Bank" value={approved} color="success" />
        <StatCard icon={<Activity className="w-5 h-5" />} label="AI Usage วันนี้" value={todayUsage.length} sublabel={`$${todayCost.toFixed(2)}`} color="accent" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<FileCheck className="w-5 h-5" />} label="Test Blueprint" value={blueprints.length} color="primary" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Review Completion Rate" value={`${reviewRate}%`} color="success" />
        <StatCard icon={<XCircle className="w-5 h-5" />} label="ข้อสอบถูกปฏิเสธ" value={rejected} color="error" />
        <StatCard icon={<AlertCircle className="w-5 h-5" />} label="ต้องปรับปรุง" value={revision} color="warning" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold text-neutral-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickActions.map(a => (
              <Link key={a.to} to={a.to} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-neutral-200 hover:border-primary-300 hover:bg-primary-50 transition-colors group">
                <div className={`rounded-lg p-3 ${a.color === 'primary' ? 'bg-primary-100 text-primary-600' : a.color === 'accent' ? 'bg-accent-100 text-accent-600' : a.color === 'warning' ? 'bg-warning-100 text-warning-600' : 'bg-success-100 text-success-600'} group-hover:scale-110 transition-transform`}>
                  <a.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-neutral-700 text-center">{a.label}</span>
              </Link>
            ))}
          </div>
          <div className="mt-6">
            <h4 className="text-sm font-medium text-neutral-700 mb-3">ข้อสอบล่าสุด</h4>
            <div className="space-y-2">
              {questions.slice(0, 5).map(q => (
                <Link key={q.id} to={`/questions/${q.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-900 truncate">{truncate(q.question_text, 80)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={QUESTION_STATUS_BADGE[q.status]}>{QUESTION_STATUS_LABELS[q.status]}</Badge>
                      <span className="text-xs text-neutral-400">{BLOOM_LABELS[q.intended_bloom_level]}</span>
                      <span className="text-xs text-neutral-400">{formatRelativeTime(q.created_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-neutral-900 mb-4">การแจ้งเตือนล่าสุด</h3>
          <div className="space-y-3">
            {demoStore.notifications.map(n => (
              <Link key={n.id} to={n.link || '#'} className="block p-3 rounded-lg hover:bg-neutral-50 transition-colors">
                <div className="flex items-start gap-2">
                  {!n.read && <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">{n.title}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-neutral-400 mt-1">{formatRelativeTime(n.created_at)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

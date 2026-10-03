import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState, Spinner, ProgressBar } from '../components/ui';
import { listCourses, listGenerationJobs } from '../lib/api';
import { formatRelativeTime } from '../lib/utils';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS } from '../types';
import type { Course, GenerationJob, GenerationJobStatus } from '../types';

const STATUS_BADGE: Record<GenerationJobStatus, 'primary'|'success'|'warning'|'error'|'neutral'|'accent'> = {
  queued:'neutral', running:'primary', validating:'accent', partially_completed:'warning', completed:'success', failed:'error', cancelled:'neutral',
};
const STATUS_LABELS: Record<GenerationJobStatus, string> = {
  queued:'รอดำเนินการ', running:'กำลังทำงาน', validating:'กำลังตรวจสอบ', partially_completed:'สำเร็จบางส่วน', completed:'เสร็จสิ้น', failed:'ล้มเหลว', cancelled:'ยกเลิก',
};

const ACTIVE_STATUSES = new Set<GenerationJobStatus>(['queued', 'running', 'validating']);

export default function GenerationJobsPage() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [jobRows, courseRows] = await Promise.all([listGenerationJobs(), listCourses()]);
      setJobs(jobRows);
      setCourses(courseRows);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  useEffect(() => {
    const hasActive = jobs.some(job => ACTIVE_STATUSES.has(job.status));
    if (!hasActive) return;
    const timer = window.setInterval(() => {
      refresh(false);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div>
      <PageHeader title="งานสร้างข้อสอบ" description="ประวัติการสร้างข้อสอบด้วย AI" />
      {jobs.length === 0 ? (
        <EmptyState icon={<Activity className="w-12 h-12" />} title="ยังไม่มีงานสร้างข้อสอบ" description="เริ่มสร้างข้อสอบด้วย AI" />
      ) : (
        <div className="space-y-3">
          {jobs.map(j => {
            const course = courses.find(c => c.id === j.course_id);
            const pct = j.progress_pct ?? (j.status === 'completed' ? 100 : j.status === 'failed' ? 100 : 0);
            return (
              <Card key={j.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`rounded-lg p-2.5 ${j.status === 'completed' ? 'bg-success-50 text-success-600' : j.status === 'failed' ? 'bg-error-50 text-error-600' : 'bg-primary-50 text-primary-600'}`}>
                      {j.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : j.status === 'failed' ? <XCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900">{course?.course_code || j.course_id} • {QUESTION_TYPE_LABELS[j.question_type]}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{formatRelativeTime(j.created_at)}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant={STATUS_BADGE[j.status]}>{STATUS_LABELS[j.status]}</Badge>
                        <Badge variant="accent">{BLOOM_LABELS[j.bloom_level]}</Badge>
                        <Badge variant="neutral">{DIFFICULTY_LABELS[j.difficulty]}</Badge>
                        {j.current_stage && <Badge variant="primary">{j.current_stage}</Badge>}
                      </div>
                      {(ACTIVE_STATUSES.has(j.status) || j.stage_message) && (
                        <div className="mt-3 max-w-md">
                          <div className="flex justify-between text-xs text-neutral-500 mb-1">
                            <span>{j.stage_message || j.current_stage || 'กำลังดำเนินการ'}</span>
                            <span>{pct}%</span>
                          </div>
                          <ProgressBar value={pct} color={j.status === 'failed' ? 'error' : j.status === 'completed' ? 'success' : 'primary'} />
                        </div>
                      )}
                      {j.error_message && <p className="text-xs text-error-600 mt-2">{j.error_message}</p>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-neutral-900">{j.generated_count}/{j.total_questions} ข้อ</p>
                    {j.failed_count > 0 && <p className="text-xs text-error-500">{j.failed_count} ข้อล้มเหลว</p>}
                    {j.estimated_cost_usd != null && <p className="text-xs text-neutral-400">${j.estimated_cost_usd.toFixed(2)}</p>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

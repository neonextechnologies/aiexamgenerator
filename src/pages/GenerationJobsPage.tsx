import { Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { formatRelativeTime } from '../lib/utils';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS } from '../types';
import type { GenerationJobStatus } from '../types';

const STATUS_BADGE: Record<GenerationJobStatus, 'primary'|'success'|'warning'|'error'|'neutral'|'accent'> = {
  queued:'neutral', running:'primary', validating:'accent', partially_completed:'warning', completed:'success', failed:'error', cancelled:'neutral',
};
const STATUS_LABELS: Record<GenerationJobStatus, string> = { queued:'รอดำเนินการ', running:'กำลังทำงาน', validating:'กำลังตรวจสอบ', partially_completed:'สำเร็จบางส่วน', completed:'เสร็จสิ้น', failed:'ล้มเหลว', cancelled:'ยกเลิก' };

export default function GenerationJobsPage() {
  const jobs = demoStore.generationJobs;
  return (
    <div>
      <PageHeader title="งานสร้างข้อสอบ" description="ประวัติการสร้างข้อสอบด้วย AI" />
      {jobs.length === 0 ? (
        <EmptyState icon={<Activity className="w-12 h-12" />} title="ยังไม่มีงานสร้างข้อสอบ" description="เริ่มสร้างข้อสอบด้วย AI" />
      ) : (
        <div className="space-y-3">
          {jobs.map(j => {
            const course = demoStore.courses.find(c => c.id === j.course_id);
            return (
              <Card key={j.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-lg p-2.5 ${j.status === 'completed' ? 'bg-success-50 text-success-600' : j.status === 'failed' ? 'bg-error-50 text-error-600' : 'bg-primary-50 text-primary-600'}`}>
                      {j.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : j.status === 'failed' ? <XCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900">{course?.course_code || j.course_id} • {QUESTION_TYPE_LABELS[j.question_type]}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{formatRelativeTime(j.created_at)}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant={STATUS_BADGE[j.status]}>{STATUS_LABELS[j.status]}</Badge>
                        <Badge variant="accent">{BLOOM_LABELS[j.bloom_level]}</Badge>
                        <Badge variant="neutral">{DIFFICULTY_LABELS[j.difficulty]}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
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

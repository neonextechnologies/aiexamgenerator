import { Link } from 'react-router-dom';
import { ClipboardCheck, AlertCircle } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { truncate, formatRelativeTime } from '../lib/utils';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from '../types';

export default function ReviewQueuePage() {
  const pending = demoStore.questions.filter(q => ['ready_for_review', 'under_review', 'revision_requested'].includes(q.status));
  return (
    <div>
      <PageHeader title="คิวตรวจข้อสอบ" description="ข้อสอบที่รอการตรวจสอบโดย Reviewer" />
      {pending.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="w-12 h-12" />} title="ไม่มีข้อสอบรอตรวจ" description="ข้อสอบที่พร้อมตรวจจะปรากฏที่นี่" />
      ) : (
        <div className="space-y-2">
          {pending.map(q => {
            const course = demoStore.courses.find(c => c.id === q.course_id);
            const hasFlags = q.quality_flags.length > 0 || (q.ai_predicted_bloom_level && q.ai_predicted_bloom_level !== q.intended_bloom_level);
            return (
              <Link key={q.id} to={`/review/${q.id}`}><Card hover className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-900">{truncate(q.question_text, 120)}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant={QUESTION_STATUS_BADGE[q.status]}>{QUESTION_STATUS_LABELS[q.status]}</Badge>
                      <Badge variant="neutral">{course?.course_code}</Badge>
                      <Badge variant="neutral">{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
                      <Badge variant="accent">{BLOOM_LABELS[q.intended_bloom_level]}</Badge>
                      <Badge variant="neutral">{DIFFICULTY_LABELS[q.intended_difficulty]}</Badge>
                      <span className="text-xs text-neutral-400">{formatRelativeTime(q.created_at)}</span>
                    </div>
                  </div>
                  {hasFlags && <AlertCircle className="w-5 h-5 text-warning-500 flex-shrink-0" />}
                </div>
              </Card></Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

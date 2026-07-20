import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Copy, FileText, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { formatDate, formatRelativeTime } from '../lib/utils';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from '../types';

export default function QuestionDetailPage() {
  const { questionId } = useParams();
  const q = demoStore.questions.find(x => x.id === questionId);
  if (!q) return <EmptyState title="ไม่พบข้อสอบ" action={<Link to="/question-bank" className="btn-primary">กลับ</Link>} />;
  const course = demoStore.courses.find(c => c.id === q.course_id);
  const reviews = demoStore.reviews.filter(r => r.question_id === q.id);

  return (
    <div>
      <Link to="/question-bank" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</Link>
      <PageHeader title="รายละเอียดข้อสอบ" description={`${course?.course_code || ''} • ${QUESTION_TYPE_LABELS[q.question_type]}`} actions={<div className="flex gap-2"><button className="btn-secondary"><Edit className="w-4 h-4" /> แก้ไข</button><button className="btn-secondary"><Copy className="w-4 h-4" /> ทำสำเนา</button></div>} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4"><Badge variant={QUESTION_STATUS_BADGE[q.status]}>{QUESTION_STATUS_LABELS[q.status]}</Badge><Badge variant="neutral">{QUESTION_TYPE_LABELS[q.question_type]}</Badge><Badge variant="accent">{BLOOM_LABELS[q.intended_bloom_level]}</Badge><Badge variant="neutral">{DIFFICULTY_LABELS[q.intended_difficulty]}</Badge><Badge variant="primary">{q.marks} คะแนน</Badge></div>
            <h3 className="font-semibold text-neutral-900 mb-2">โจทย์</h3>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{q.question_text}</p>
            {q.choices && q.choices.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium text-neutral-700">ตัวเลือก</h4>
                {q.choices.map(c => (
                  <div key={c.id} className={`p-3 rounded-lg border ${c.is_correct ? 'border-success-300 bg-success-50' : 'border-neutral-200'}`}>
                    <div className="flex items-start gap-2"><span className="font-mono text-sm font-semibold text-neutral-600">{c.id}.</span><div className="flex-1"><p className="text-sm text-neutral-900">{c.text}</p>{c.is_correct && <p className="text-xs text-success-600 mt-1">✓ คำตอบที่ถูกต้อง</p>}<p className="text-xs text-neutral-400 mt-1">{c.rationale}</p></div></div>
                  </div>
                ))}
              </div>
            )}
            {q.correct_answer && !q.choices && <div className="mt-4 p-3 rounded-lg bg-success-50 border border-success-200"><p className="text-sm font-medium text-success-700">เฉลย: {Array.isArray(q.correct_answer) ? q.correct_answer.join(', ') : q.correct_answer}</p></div>}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-neutral-900 mb-3">คำอธิบาย/เฉลย</h3>
            <p className="text-sm text-neutral-700">{q.explanation}</p>
          </Card>

          {q.rubric && (
            <Card className="p-5">
              <h3 className="font-semibold text-neutral-900 mb-3">Rubric (คะแนนรวม {q.rubric.total_marks})</h3>
              <div className="space-y-4">
                {q.rubric.criteria.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1"><p className="text-sm font-medium text-neutral-900">{c.criterion}</p><Badge variant="primary">{c.max_marks} คะแนน</Badge></div>
                    <p className="text-xs text-neutral-500 mb-2">{c.description}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {c.performance_levels.map((pl, j) => (
                        <div key={j} className="p-2 rounded-lg bg-neutral-50 border border-neutral-100"><p className="text-xs font-medium text-neutral-700">{pl.level}</p><p className="text-xs text-neutral-400">{pl.marks_range}</p></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {q.source_references && q.source_references.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-neutral-900 mb-3">แหล่งอ้างอิง</h3>
              <div className="space-y-2">
                {q.source_references.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50">
                    <FileText className="w-4 h-4 text-neutral-400" />
                    <div className="flex-1"><p className="text-sm font-medium text-neutral-900">{s.file_name}</p><p className="text-xs text-neutral-400">หน้า {s.page} • {s.section}</p></div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-neutral-900 mb-3">ข้อมูลข้อสอบ</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">รายวิชา</span><span className="font-medium">{course?.course_code}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Topic</span><span className="font-medium">{q.topic}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">CLO</span><span className="font-medium">{q.learning_outcome_codes.join(', ')}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">ภาษา</span><span className="font-medium">{q.language === 'th' ? 'ไทย' : 'English'}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">เวลาที่ใช้</span><span className="font-medium">{q.estimated_answer_time_minutes} นาที</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">สร้างโดย</span><span className="font-medium">{q.generated_by_ai ? 'AI' : 'มนุษย์'}</span></div>
              {q.ai_model && <div className="flex justify-between"><span className="text-neutral-500">AI Model</span><span className="font-medium">{q.ai_model}</span></div>}
              <div className="flex justify-between"><span className="text-neutral-500">Quality Score</span><span className="font-medium">{q.quality_score || '-'}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">ใช้แล้ว</span><span className="font-medium">{q.used_count} ครั้ง</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Exposure</span><Badge variant="neutral">{q.exposure_level}</Badge></div>
              <div className="flex justify-between"><span className="text-neutral-500">สร้างเมื่อ</span><span className="text-xs text-neutral-400">{formatDate(q.created_at)}</span></div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-neutral-900 mb-3">Bloom & Difficulty</h3>
            <div className="space-y-3 text-sm">
              <div><p className="text-xs text-neutral-400 mb-1">Intended Bloom</p><Badge variant="primary">{BLOOM_LABELS[q.intended_bloom_level]}</Badge></div>
              {q.ai_predicted_bloom_level && <div><p className="text-xs text-neutral-400 mb-1">AI Predicted</p><Badge variant={q.ai_predicted_bloom_level === q.intended_bloom_level ? 'success' : 'warning'}>{BLOOM_LABELS[q.ai_predicted_bloom_level]}</Badge></div>}
              {q.reviewer_confirmed_bloom_level && <div><p className="text-xs text-neutral-400 mb-1">Reviewer Confirmed</p><Badge variant="success">{BLOOM_LABELS[q.reviewer_confirmed_bloom_level]}</Badge></div>}
              {q.ai_predicted_bloom_level && q.ai_predicted_bloom_level !== q.intended_bloom_level && <div className="flex items-center gap-2 p-2 rounded-lg bg-warning-50"><AlertCircle className="w-4 h-4 text-warning-600" /><p className="text-xs text-warning-700">Bloom ไม่ตรงกับที่กำหนด</p></div>}
            </div>
          </Card>

          {reviews.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-neutral-900 mb-3">ประวัติการตรวจ</h3>
              <div className="space-y-3">
                {reviews.map(r => (
                  <div key={r.id} className="p-3 rounded-lg bg-neutral-50">
                    <div className="flex items-center gap-2 mb-1">
                      {r.decision === 'approved' ? <CheckCircle2 className="w-4 h-4 text-success-600" /> : r.decision === 'rejected' ? <XCircle className="w-4 h-4 text-error-600" /> : <Clock className="w-4 h-4 text-warning-600" />}
                      <span className="text-sm font-medium">{r.reviewer_name}</span>
                      <Badge variant={r.decision === 'approved' ? 'success' : r.decision === 'rejected' ? 'error' : 'warning'}>{r.decision === 'approved' ? 'อนุมัติ' : r.decision === 'rejected' ? 'ปฏิเสธ' : 'ขอแก้ไข'}</Badge>
                    </div>
                    <p className="text-xs text-neutral-500">{r.comment}</p>
                    <p className="text-xs text-neutral-400 mt-1">{formatRelativeTime(r.created_at)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

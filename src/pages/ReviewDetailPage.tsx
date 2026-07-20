import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState, Spinner } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from '../types';
import type { BloomLevel, DifficultyLevel } from '../types';

export default function ReviewDetailPage() {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const q = demoStore.questions.find(x => x.id === questionId);
  const [decision, setDecision] = useState<'approved'|'rejected'|'revision_requested'>('approved');
  const [comment, setComment] = useState('');
  const [confirmedBloom, setConfirmedBloom] = useState<BloomLevel | ''>('');
  const [confirmedDiff, setConfirmedDiff] = useState<DifficultyLevel | ''>('');
  const [submitting, setSubmitting] = useState(false);

  if (!q) return <EmptyState title="ไม่พบข้อสอบ" action={<Link to="/review" className="btn-primary">กลับ</Link>} />;
  const course = demoStore.courses.find(c => c.id === q.course_id);

  const handleSubmit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 500));
    const status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'revision_requested';
    q.status = status;
    if (decision === 'approved') { q.approved_by = 'u-rev'; q.approved_at = new Date().toISOString(); q.reviewer_confirmed_bloom_level = (confirmedBloom || q.intended_bloom_level) as BloomLevel; q.reviewer_confirmed_difficulty = (confirmedDiff || q.intended_difficulty) as DifficultyLevel; }
    demoStore.reviews.push({ id: `r-${Date.now()}`, question_id: q.id, reviewer_id: 'u-rev', reviewer_name: 'ดร. สมหญิง รักงาน', decision, comment, confirmed_bloom: (confirmedBloom || null) as BloomLevel | null, confirmed_difficulty: (confirmedDiff || null) as DifficultyLevel | null, created_at: new Date().toISOString() });
    setSubmitting(false);
    navigate('/review');
  };

  return (
    <div>
      <Link to="/review" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</Link>
      <PageHeader title="ตรวจข้อสอบ" description={`${course?.course_code || ''} • ${QUESTION_TYPE_LABELS[q.question_type]}`} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 flex-wrap"><Badge variant={QUESTION_STATUS_BADGE[q.status]}>{QUESTION_STATUS_LABELS[q.status]}</Badge><Badge variant="neutral">{QUESTION_TYPE_LABELS[q.question_type]}</Badge><Badge variant="accent">{BLOOM_LABELS[q.intended_bloom_level]}</Badge><Badge variant="neutral">{DIFFICULTY_LABELS[q.intended_difficulty]}</Badge><Badge variant="primary">{q.marks} คะแนน</Badge></div>
            <h3 className="font-semibold text-neutral-900 mb-2">โจทย์</h3>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{q.question_text}</p>
            {q.choices && q.choices.length > 0 && (
              <div className="mt-4 space-y-2">
                {q.choices.map(c => (
                  <div key={c.id} className={`p-3 rounded-lg border ${c.is_correct ? 'border-success-300 bg-success-50' : 'border-neutral-200'}`}>
                    <div className="flex items-start gap-2"><span className="font-mono text-sm font-semibold">{c.id}.</span><div className="flex-1"><p className="text-sm text-neutral-900">{c.text}</p>{c.is_correct && <p className="text-xs text-success-600 mt-1">✓ คำตอบที่ถูกต้อง</p>}<p className="text-xs text-neutral-400 mt-1">{c.rationale}</p></div></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold text-neutral-900 mb-2">คำอธิบาย/เฉลย</h3>
            <p className="text-sm text-neutral-700">{q.explanation}</p>
          </Card>
          {q.rubric && (
            <Card className="p-5">
              <h3 className="font-semibold text-neutral-900 mb-3">Rubric (คะแนนรวม {q.rubric.total_marks})</h3>
              <div className="space-y-3">
                {q.rubric.criteria.map((c, i) => (
                  <div key={i}><div className="flex justify-between mb-1"><p className="text-sm font-medium">{c.criterion}</p><Badge variant="primary">{c.max_marks}</Badge></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{c.performance_levels.map((pl, j) => <div key={j} className="p-2 rounded bg-neutral-50 text-xs"><p className="font-medium">{pl.level}</p><p className="text-neutral-400">{pl.marks_range}</p></div>)}</div></div>
                ))}
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-neutral-900 mb-3">การตัดสินใจ</h3>
            <div className="space-y-2">
              {[{ v:'approved', l:'อนุมัติ', icon:CheckCircle2, color:'success' }, { v:'revision_requested', l:'ขอแก้ไข', icon:Clock, color:'warning' }, { v:'rejected', l:'ปฏิเสธ', icon:XCircle, color:'error' }].map(o => (
                <button key={o.v} onClick={() => setDecision(o.v as typeof decision)} className={`w-full flex items-center gap-2 p-3 rounded-lg border transition-colors ${decision === o.v ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                  <o.icon className={`w-4 h-4 ${o.color === 'success' ? 'text-success-600' : o.color === 'warning' ? 'text-warning-600' : 'text-error-600'}`} />
                  <span className="text-sm font-medium">{o.l}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold text-neutral-900 mb-3">ยืนยัน Bloom & Difficulty</h3>
            <div className="space-y-3">
              <div><label className="label">Bloom Level</label><select value={confirmedBloom} onChange={e => setConfirmedBloom(e.target.value as BloomLevel)} className="input"><option value="">ใช้ค่าเดิม ({BLOOM_LABELS[q.intended_bloom_level]})</option>{Object.entries(BLOOM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label">Difficulty</label><select value={confirmedDiff} onChange={e => setConfirmedDiff(e.target.value as DifficultyLevel)} className="input"><option value="">ใช้ค่าเดิม ({DIFFICULTY_LABELS[q.intended_difficulty]})</option>{Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold text-neutral-900 mb-3">ความคิดเห็น</h3>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} className="input" placeholder="ระบุความคิดเห็นหรือเหตุผล..." />
          </Card>
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary w-full">{submitting ? <Spinner size="sm" /> : 'ส่งผลการตรวจ'}</button>
        </div>
      </div>
    </div>
  );
}

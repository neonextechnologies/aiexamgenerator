import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertCircle, Edit } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState, Spinner } from '../components/ui';
import { getCourse, getQuestion, listQuestionEditHistory, listReviews, saveQuestionEdit, submitReview } from '../lib/api';
import { useAuth } from '../lib/auth';
import { QuestionEditorForm } from '../components/questions/QuestionEditorForm';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from '../types';
import type { BloomLevel, Course, DifficultyLevel, Question, QuestionEditHistory, QuestionReview } from '../types';

export default function ReviewDetailPage() {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQuestion] = useState<Question | null>(null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [history, setHistory] = useState<QuestionEditHistory[]>([]);
  const [reviews, setReviews] = useState<QuestionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<'approved'|'rejected'|'revision_requested'>('approved');
  const [comment, setComment] = useState('');
  const [confirmedBloom, setConfirmedBloom] = useState<BloomLevel | ''>('');
  const [confirmedDiff, setConfirmedDiff] = useState<DifficultyLevel | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async (id: string) => {
    const question = await getQuestion(id);
    setQuestion(question);
    setDraft(question ? structuredClone(question) : null);
    if (question) {
      const [courseRow, historyRows, reviewRows] = await Promise.all([
        getCourse(question.course_id),
        listQuestionEditHistory(question.id),
        listReviews(question.id),
      ]);
      setCourse(courseRow);
      setHistory(historyRows);
      setReviews(reviewRows);
    }
  };

  useEffect(() => {
    if (!questionId) { setLoading(false); return; }
    reload(questionId).finally(() => setLoading(false));
  }, [questionId]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!q || !draft) return <EmptyState title="ไม่พบข้อสอบ" action={<Link to="/review" className="btn-primary">กลับ</Link>} />;

  const handleSaveEdits = async () => {
    if (!user) return;
    setSaving(true); setMessage(null);
    try {
      await saveQuestionEdit({
        questionId: q.id,
        editedBy: user.id,
        editorName: user.full_name,
        changeSummary: 'แก้ไขระหว่างการตรวจทาน',
        source: 'review',
        patch: {
          question_text: draft.question_text,
          choices: draft.choices,
          correct_answer: draft.correct_answer,
          explanation: draft.explanation,
          rubric: draft.rubric,
          topic: draft.topic,
          tags: draft.tags,
        },
      });
      await reload(q.id);
      setEditing(false);
      setMessage('บันทึกการแก้ไขแล้ว');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      await submitReview({
        questionId: q.id, reviewerId: user.id, reviewerName: user.full_name, decision, comment,
        confirmedBloom: (confirmedBloom || q.intended_bloom_level) as BloomLevel,
        confirmedDifficulty: (confirmedDiff || q.intended_difficulty) as DifficultyLevel,
      });
      navigate('/review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link to="/review" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</Link>
      <PageHeader
        title="ตรวจข้อสอบ"
        description={`${course?.course_code || ''} • ${QUESTION_TYPE_LABELS[q.question_type]}`}
        actions={<button className="btn-secondary" onClick={() => setEditing(v => !v)}><Edit className="w-4 h-4" /> {editing ? 'ปิดโหมดแก้ไข' : 'แก้ไขข้อสอบ'}</button>}
      />
      {message && <div className="mb-4 p-3 rounded-lg bg-primary-50 text-primary-700 text-sm">{message}</div>}

      {(q.quality_flags.includes('duplicate') || q.quality_flags.includes('near_duplicate') || q.near_duplicate_of) && (
        <Card className="p-4 mb-4 border border-warning-200 bg-warning-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-warning-600 mt-0.5" />
            <div>
              <p className="font-medium text-warning-800">พบความซ้ำหรือใกล้เคียงกับคลังข้อสอบ</p>
              <p className="text-sm text-warning-700 mt-1">
                {q.near_duplicate_of
                  ? `ใกล้เคียงกับ ${q.near_duplicate_of}${q.near_duplicate_score ? ` (${(Number(q.near_duplicate_score) * 100).toFixed(0)}%)` : ''}`
                  : 'ตรวจสอบคุณภาพก่อนอนุมัติ'}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {editing ? (
            <Card className="p-5">
              <QuestionEditorForm question={draft} disabled={saving} onChange={patch => setDraft(prev => prev ? { ...prev, ...patch } : prev)} />
              <div className="flex justify-end gap-2 mt-4">
                <button className="btn-secondary" disabled={saving} onClick={() => { setDraft(structuredClone(q)); setEditing(false); }}>ยกเลิก</button>
                <button className="btn-primary" disabled={saving} onClick={handleSaveEdits}>{saving ? <Spinner size="sm" /> : 'บันทึกการแก้ไข'}</button>
              </div>
            </Card>
          ) : (
            <>
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
            </>
          )}

          {(history.length > 0 || reviews.length > 0) && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">ประวัติการตรวจ/แก้ไข</h3>
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id} className="p-3 rounded bg-neutral-50 text-sm">
                    <p className="font-medium">{h.editor_name || h.edited_by} • แก้ไข</p>
                    <p className="text-neutral-500">{h.change_summary}</p>
                  </div>
                ))}
                {reviews.map(r => (
                  <div key={r.id} className="p-3 rounded bg-neutral-50 text-sm">
                    <p className="font-medium">{r.reviewer_name} • {r.decision}</p>
                    <p className="text-neutral-500">{r.comment}</p>
                  </div>
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
          <button onClick={handleSubmit} disabled={submitting || editing} className="btn-primary w-full">{submitting ? <Spinner size="sm" /> : 'ส่งผลการตรวจ'}</button>
        </div>
      </div>
    </div>
  );
}

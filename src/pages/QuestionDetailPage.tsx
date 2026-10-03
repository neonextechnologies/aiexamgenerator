import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Copy, FileText, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState, Spinner, Modal } from '../components/ui';
import { duplicateQuestion, getCourse, getQuestion, listQuestionEditHistory, listReviews, saveQuestionEdit } from '../lib/api';
import { formatDate, formatRelativeTime } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { QuestionEditorForm } from '../components/questions/QuestionEditorForm';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from '../types';
import type { Course, Question, QuestionEditHistory, QuestionReview } from '../types';

export default function QuestionDetailPage() {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQuestion] = useState<Question | null>(null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [reviews, setReviews] = useState<QuestionReview[]>([]);
  const [history, setHistory] = useState<QuestionEditHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async (id: string) => {
    const question = await getQuestion(id);
    setQuestion(question);
    setDraft(question ? { ...question, choices: question.choices ? question.choices.map(c => ({ ...c })) : null, rubric: question.rubric ? structuredClone(question.rubric) : null } : null);
    if (question) {
      const [courseRow, reviewRows, historyRows] = await Promise.all([
        getCourse(question.course_id),
        listReviews(question.id),
        listQuestionEditHistory(question.id),
      ]);
      setCourse(courseRow);
      setReviews(reviewRows);
      setHistory(historyRows);
    }
  };

  useEffect(() => {
    if (!questionId) { setLoading(false); return; }
    reload(questionId).finally(() => setLoading(false));
  }, [questionId]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!q) return <EmptyState title="ไม่พบข้อสอบ" action={<Link to="/question-bank" className="btn-primary">กลับ</Link>} />;

  const saveEdit = async () => {
    if (!draft || !user) return;
    setSaving(true); setMessage(null);
    try {
      await saveQuestionEdit({
        questionId: q.id,
        editedBy: user.id,
        editorName: user.full_name,
        changeSummary: 'แก้ไขข้อสอบจากหน้ารายละเอียด',
        source: 'editor',
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

  const handleDuplicate = async () => {
    if (!user) return;
    const copy = await duplicateQuestion(q.id, user.id);
    navigate(`/questions/${copy.id}`);
  };

  return (
    <div>
      <Link to="/question-bank" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</Link>
      <PageHeader
        title="รายละเอียดข้อสอบ"
        description={`${course?.course_code || ''} • ${QUESTION_TYPE_LABELS[q.question_type]}`}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => { setDraft(q); setEditing(true); }}><Edit className="w-4 h-4" /> แก้ไข</button>
            <button className="btn-secondary" onClick={handleDuplicate}><Copy className="w-4 h-4" /> ทำสำเนา</button>
          </div>
        }
      />
      {message && <div className="mb-4 p-3 rounded-lg bg-primary-50 text-primary-700 text-sm">{message}</div>}

      {(q.quality_flags.includes('duplicate') || q.quality_flags.includes('near_duplicate') || q.near_duplicate_of) && (
        <Card className="p-4 mb-4 border border-warning-200 bg-warning-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-warning-600 mt-0.5" />
            <div>
              <p className="font-medium text-warning-800">คำเตือน: พบความซ้ำ/ใกล้เคียงในคลังข้อสอบ</p>
              <p className="text-sm text-warning-700 mt-1">
                {q.near_duplicate_of
                  ? `อ้างอิงข้อ ${q.near_duplicate_of}${q.near_duplicate_score ? ` (ความคล้าย ${(Number(q.near_duplicate_score) * 100).toFixed(0)}%)` : ''}`
                  : q.quality_flags.join(', ')}
              </p>
            </div>
          </div>
        </Card>
      )}

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
              <div className="flex justify-between gap-2"><span className="text-neutral-500">แท็ก</span><span className="font-medium text-right">{(q.tags || []).join(', ') || '-'}</span></div>
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

          {history.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-neutral-900 mb-3">ประวัติการแก้ไข</h3>
              <div className="space-y-3">
                {history.map(h => (
                  <div key={h.id} className="p-3 rounded-lg bg-neutral-50">
                    <p className="text-sm font-medium">{h.editor_name || h.edited_by}</p>
                    <p className="text-xs text-neutral-500">{h.change_summary}</p>
                    <p className="text-xs text-neutral-400 mt-1">{formatRelativeTime(h.created_at)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={editing && !!draft} onClose={() => !saving && setEditing(false)} title="แก้ไขข้อสอบ" size="xl">
        {draft && (
          <div className="space-y-4">
            <QuestionEditorForm
              question={draft}
              disabled={saving}
              onChange={patch => setDraft(prev => prev ? { ...prev, ...patch } : prev)}
            />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" disabled={saving} onClick={() => setEditing(false)}>ยกเลิก</button>
              <button className="btn-primary" disabled={saving} onClick={saveEdit}>{saving ? <Spinner size="sm" /> : 'บันทึก'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

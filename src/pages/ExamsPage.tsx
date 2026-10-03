import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileCheck, Plus } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState, Spinner, Modal } from '../components/ui';
import { createExam, listCourses, listExams, listQuestions } from '../lib/api';
import { formatDate } from '../lib/utils';
import { EXAM_TYPE_LABELS, QUESTION_TYPE_LABELS } from '../types';
import type { Course, Exam, ExamType, Question } from '../types';

export default function ExamsPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    course_id: '',
    name: '',
    exam_type: 'midterm' as ExamType,
    duration_minutes: 60,
    instructions: '',
    question_ids: [] as string[],
  });

  const load = async () => {
    const [examRows, courseRows] = await Promise.all([listExams(), listCourses()]);
    setExams(examRows);
    setCourses(courseRows);
    if (!form.course_id && courseRows[0]) setForm(prev => ({ ...prev, course_id: courseRows[0].id }));
  };

  useEffect(() => {
    void load().finally(() => setLoading(false));
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!form.course_id) { setQuestions([]); return; }
    listQuestions({ courseId: form.course_id }).then(setQuestions);
  }, [form.course_id]);

  const toggleQuestion = (id: string) => {
    setForm(prev => ({
      ...prev,
      question_ids: prev.question_ids.includes(id)
        ? prev.question_ids.filter(qid => qid !== id)
        : [...prev.question_ids, id],
    }));
  };

  const handleCreate = async () => {
    if (!form.course_id || !form.name.trim() || form.question_ids.length === 0) {
      setError('กรุณาเลือกวิชา ตั้งชื่อ และเลือกอย่างน้อย 1 ข้อ');
      return;
    }
    setSaving(true); setError(null);
    try {
      const exam = await createExam(form);
      setOpen(false);
      await load();
      navigate(`/exams/${exam.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างชุดข้อสอบไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  return (
    <div>
      <PageHeader title="ชุดข้อสอบ" description="จัดการชุดข้อสอบและหลาย Version" actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> สร้างชุดข้อสอบ</button>} />
      {exams.length === 0 ? (
        <EmptyState icon={<FileCheck className="w-12 h-12" />} title="ยังไม่มีชุดข้อสอบ" description="เริ่มสร้างชุดข้อสอบจาก Question Bank" action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> สร้างชุดข้อสอบ</button>} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map(e => {
            const course = courses.find(c => c.id === e.course_id);
            return (
              <Link key={e.id} to={`/exams/${e.id}`}><Card hover className="p-5">
                <div className="flex items-start justify-between mb-3"><div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center"><FileCheck className="w-5 h-5 text-primary-600" /></div><Badge variant="neutral">{e.status}</Badge></div>
                <h3 className="font-semibold text-neutral-900">{e.name}</h3>
                <p className="text-xs text-neutral-400 mt-1">{course?.course_code} • {EXAM_TYPE_LABELS[e.exam_type]}</p>
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-neutral-100">
                  <div className="text-center"><p className="text-lg font-bold">{e.questions.length}</p><p className="text-xs text-neutral-400">ข้อ</p></div>
                  <div className="text-center"><p className="text-lg font-bold">{e.total_marks}</p><p className="text-xs text-neutral-400">คะแนน</p></div>
                  <div className="text-center"><p className="text-lg font-bold">{e.versions.length}</p><p className="text-xs text-neutral-400">เวอร์ชัน</p></div>
                </div>
                <p className="text-xs text-neutral-400 mt-3">{e.duration_minutes} นาที • {e.exam_date ? formatDate(e.exam_date) : 'ยังไม่กำหนด'}</p>
              </Card></Link>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="สร้างชุดข้อสอบ" size="xl">
        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">รายวิชา</label>
              <select className="input" value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value, question_ids: [] })}>
                {courses.map(c => <option key={c.id} value={c.id}>{c.course_code} — {c.course_name_th}</option>)}
              </select>
            </div>
            <div>
              <label className="label">ประเภท</label>
              <select className="input" value={form.exam_type} onChange={e => setForm({ ...form, exam_type: e.target.value as ExamType })}>
                {Object.entries(EXAM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">ชื่อชุดข้อสอบ</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">คำชี้แจง</label><textarea className="input min-h-20" value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} /></div>
          <div>
            <label className="label">เลือกข้อสอบจากคลัง ({form.question_ids.length} ข้อ)</label>
            <div className="max-h-64 overflow-y-auto space-y-2 border border-neutral-200 rounded-lg p-3">
              {questions.length === 0 ? <p className="text-sm text-neutral-500">ยังไม่มีข้อสอบในรายวิชานี้</p> : questions.map(q => (
                <label key={q.id} className="flex items-start gap-3 p-2 rounded hover:bg-neutral-50 cursor-pointer">
                  <input type="checkbox" checked={form.question_ids.includes(q.id)} onChange={() => toggleQuestion(q.id)} className="mt-1" />
                  <div>
                    <p className="text-sm">{q.question_text.slice(0, 120)}</p>
                    <p className="text-xs text-neutral-400">{QUESTION_TYPE_LABELS[q.question_type]} • {q.marks} คะแนน</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-error-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" disabled={saving} onClick={() => setOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>{saving ? <Spinner size="sm" /> : 'สร้างชุดข้อสอบ'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

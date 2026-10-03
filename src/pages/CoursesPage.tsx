import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Users, Calendar } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState, Spinner, Modal } from '../components/ui';
import { createCourseFromForm, listCourses, listLearningOutcomes, listQuestions } from '../lib/api';
import { fetchCourseDocuments } from '../lib/documents';
import { useAuth } from '../lib/auth';
import type { Course } from '../types';

export default function CoursesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [counts, setCounts] = useState<Record<string, { clos: number; docs: number; questions: number }>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    course_code: '',
    course_name_th: '',
    course_name_en: '',
    description: '',
    credits: 3,
    level: 'ปริญญาโท',
    faculty: '',
    department: '',
    semester: '1',
    academic_year: '2569',
  });

  const load = async () => {
    const [courseRows, outcomes, questions] = await Promise.all([listCourses(), listLearningOutcomes(), listQuestions()]);
    const documents = await Promise.all(courseRows.map(c => fetchCourseDocuments(c.id)));
    setCourses(courseRows);
    setCounts(Object.fromEntries(courseRows.map((c, i) => [c.id, {
      clos: outcomes.filter(lo => lo.course_id === c.id).length,
      docs: documents[i].length,
      questions: questions.filter(q => q.course_id === c.id).length,
    }])));
  };

  useEffect(() => {
    let active = true;
    load().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleCreate = async () => {
    if (!user) return;
    if (!form.course_code.trim() || !form.course_name_th.trim()) {
      setError('กรุณากรอกรหัสและชื่อรายวิชา');
      return;
    }
    setSaving(true); setError(null);
    try {
      const course = await createCourseFromForm({ ...form, instructor_id: user.id });
      setOpen(false);
      await load();
      navigate(`/courses/${course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างรายวิชาไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  return (
    <div>
      <PageHeader title="รายวิชา" description="จัดการรายวิชาและเนื้อหา" actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> สร้างรายวิชา</button>} />
      {courses.length === 0 ? (
        <EmptyState icon={<BookOpen className="w-12 h-12" />} title="ยังไม่มีรายวิชา" description="เริ่มสร้างรายวิชาแรกของคุณ" action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> สร้างรายวิชา</button>} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(c => {
            const cloCount = counts[c.id]?.clos || 0;
            const docCount = counts[c.id]?.docs || 0;
            const qCount = counts[c.id]?.questions || 0;
            return (
              <Link key={c.id} to={`/courses/${c.id}`}>
                <Card hover className="p-5 h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center"><BookOpen className="w-5 h-5 text-primary-600" /></div>
                    <Badge variant="success">active</Badge>
                  </div>
                  <p className="text-sm font-mono text-primary-600">{c.course_code}</p>
                  <h3 className="font-semibold text-neutral-900 mt-1">{c.course_name_th}</h3>
                  <p className="text-xs text-neutral-500 mt-1">{c.course_name_en}</p>
                  <p className="text-sm text-neutral-600 mt-3 line-clamp-2">{c.description}</p>
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-neutral-100">
                    <div className="text-center"><p className="text-lg font-bold text-neutral-900">{cloCount}</p><p className="text-xs text-neutral-400">CLO</p></div>
                    <div className="text-center"><p className="text-lg font-bold text-neutral-900">{docCount}</p><p className="text-xs text-neutral-400">เอกสาร</p></div>
                    <div className="text-center"><p className="text-lg font-bold text-neutral-900">{qCount}</p><p className="text-xs text-neutral-400">ข้อสอบ</p></div>
                  </div>
                  <div className="flex items-center gap-3 mt-4 text-xs text-neutral-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {c.semester}/{c.academic_year}</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.level}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="สร้างรายวิชา" size="lg">
        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label">รหัสรายวิชา</label><input className="input" value={form.course_code} onChange={e => setForm({ ...form, course_code: e.target.value })} /></div>
            <div><label className="label">หน่วยกิต</label><input className="input" type="number" value={form.credits} onChange={e => setForm({ ...form, credits: Number(e.target.value) || 0 })} /></div>
          </div>
          <div><label className="label">ชื่อรายวิชา (ไทย)</label><input className="input" value={form.course_name_th} onChange={e => setForm({ ...form, course_name_th: e.target.value })} /></div>
          <div><label className="label">ชื่อรายวิชา (อังกฤษ)</label><input className="input" value={form.course_name_en} onChange={e => setForm({ ...form, course_name_en: e.target.value })} /></div>
          <div><label className="label">คำอธิบายรายวิชา</label><textarea className="input min-h-24" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label">ภาคเรียน</label><input className="input" value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })} /></div>
            <div><label className="label">ปีการศึกษา</label><input className="input" value={form.academic_year} onChange={e => setForm({ ...form, academic_year: e.target.value })} /></div>
          </div>
          {error && <p className="text-sm text-error-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" disabled={saving} onClick={() => setOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>{saving ? <Spinner size="sm" /> : 'สร้างรายวิชา'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

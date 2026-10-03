import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Eye, Download, Copy, Plus, FileText, KeyRound } from 'lucide-react';
import { Card, PageHeader, Badge, Tabs, EmptyState, Spinner, Modal } from '../components/ui';
import { getCourse, getExam, listQuestions } from '../lib/api';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, EXAM_TYPE_LABELS } from '../types';
import type { Course, Exam, Question } from '../types';
import {
  buildExamPreviewHtml,
  downloadExamExport,
  type ExportFormat,
  type ExportKind,
} from '../services/export/exam-export';

export default function ExamDetailPage() {
  const { examId } = useParams();
  const [tab, setTab] = useState('questions');
  const [exam, setExam] = useState<Exam | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [previewKind, setPreviewKind] = useState<ExportKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!examId) { setLoading(false); return; }
    getExam(examId).then(async examRow => {
      setExam(examRow);
      if (examRow) {
        const [courseRow, questionRows] = await Promise.all([getCourse(examRow.course_id), listQuestions({ courseId: examRow.course_id })]);
        const byId = new Map(questionRows.map(q => [q.id, q]));
        setCourse(courseRow);
        setQuestions(examRow.questions.map(eq => byId.get(eq.question_id)).filter((q): q is Question => !!q));
      }
    }).finally(() => setLoading(false));
  }, [examId]);

  const previewHtml = useMemo(() => {
    if (!exam || !previewKind) return '';
    return buildExamPreviewHtml({ exam, course, questions, kind: previewKind });
  }, [exam, course, questions, previewKind]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!exam) return <EmptyState title="ไม่พบชุดข้อสอบ" action={<Link to="/exams" className="btn-primary">กลับ</Link>} />;

  const tabs = [
    { id: 'questions', label: 'ข้อสอบ', count: questions.length },
    { id: 'versions', label: 'เวอร์ชัน', count: exam.versions.length },
    { id: 'preview', label: 'พรีวิว' },
    { id: 'settings', label: 'ตั้งค่า' },
  ];

  const runExport = async (kind: ExportKind, format: ExportFormat) => {
    setBusy(true); setMessage(null);
    try {
      const result = await downloadExamExport({ exam, course, questions, kind }, format);
      setMessage(`ดาวน์โหลดแล้ว: ${result.filename}`);
      setExportOpen(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'ส่งออกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/exams" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</Link>
      <PageHeader
        title={exam.name}
        description={`${course?.course_code} • ${EXAM_TYPE_LABELS[exam.exam_type]} • ${exam.questions.length} ข้อ • ${exam.total_marks} คะแนน • ${exam.duration_minutes} นาที`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary" onClick={() => { setPreviewKind('exam'); setTab('preview'); }}><Eye className="w-4 h-4" /> พรีวิว</button>
            <button className="btn-secondary" onClick={() => { setPreviewKind('answer_key'); setTab('preview'); }}><KeyRound className="w-4 h-4" /> พรีวิวเฉลย</button>
            <button className="btn-secondary" onClick={() => setExportOpen(true)}><Download className="w-4 h-4" /> Export</button>
          </div>
        }
      />
      {message && <div className="mb-4 p-3 rounded-lg bg-success-50 text-success-700 text-sm">{message}</div>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'questions' && (
          <div className="space-y-2">
            {questions.map((q, i) => q && (
              <Card key={q.id} className="p-4 flex items-start gap-3">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm font-semibold text-primary-700">{i + 1}</span>
                <div className="flex-1 min-w-0"><p className="text-sm text-neutral-900">{q.question_text.slice(0, 120)}...</p><div className="flex gap-2 mt-2 flex-wrap"><Badge variant="neutral">{QUESTION_TYPE_LABELS[q.question_type]}</Badge><Badge variant="accent">{BLOOM_LABELS[q.intended_bloom_level]}</Badge><Badge variant="neutral">{DIFFICULTY_LABELS[q.intended_difficulty]}</Badge><Badge variant="primary">{q.marks} คะแนน</Badge></div></div>
              </Card>
            ))}
          </div>
        )}
        {tab === 'versions' && (
          <div className="space-y-3">
            {exam.versions.map((v, i) => (
              <Card key={i} className="p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">เวอร์ชัน {v.version_label}</h3><p className="text-xs text-neutral-400">{v.questions.length} ข้อ • Shuffle: {v.shuffle_questions ? 'เปิด' : 'ปิด'} • Shuffle Choices: {v.shuffle_choices ? 'เปิด' : 'ปิด'}</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={() => { setPreviewKind('exam'); setTab('preview'); }}><Eye className="w-4 h-4" /></button><button className="btn-secondary"><Copy className="w-4 h-4" /></button></div></div></Card>
            ))}
            <button className="btn-primary"><Plus className="w-4 h-4" /> สร้างเวอร์ชันใหม่</button>
          </div>
        )}
        {tab === 'preview' && (
          <Card className="p-0 overflow-hidden">
            <div className="flex gap-2 p-4 border-b border-neutral-100">
              <button className={`btn-secondary ${previewKind !== 'answer_key' ? 'ring-2 ring-primary-300' : ''}`} onClick={() => setPreviewKind('exam')}><FileText className="w-4 h-4" /> ข้อสอบ</button>
              <button className={`btn-secondary ${previewKind === 'answer_key' ? 'ring-2 ring-primary-300' : ''}`} onClick={() => setPreviewKind('answer_key')}><KeyRound className="w-4 h-4" /> เฉลย</button>
            </div>
            <iframe title="exam-preview" className="w-full min-h-[70vh] bg-white" srcDoc={previewHtml || buildExamPreviewHtml({ exam, course, questions, kind: 'exam' })} />
          </Card>
        )}
        {tab === 'settings' && (
          <Card className="p-5"><p className="text-sm text-neutral-500">ตั้งค่าชุดข้อสอบ — แก้ไขชื่อ คำสั่ง วันสอบ และสถานะ</p></Card>
        )}
      </div>

      <Modal open={exportOpen} onClose={() => !busy && setExportOpen(false)} title="ส่งออกชุดข้อสอบ" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">เลือกประเภทเอกสารและรูปแบบไฟล์ Word (.docx) หรือ PDF (ฝังฟอนต์ Sarabun สำหรับภาษาไทย)</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <button disabled={busy} className="btn-primary justify-center" onClick={() => runExport('exam', 'docx')}>ข้อสอบ DOCX</button>
            <button disabled={busy} className="btn-primary justify-center" onClick={() => runExport('exam', 'pdf')}>ข้อสอบ PDF</button>
            <button disabled={busy} className="btn-secondary justify-center" onClick={() => runExport('answer_key', 'docx')}>เฉลย DOCX</button>
            <button disabled={busy} className="btn-secondary justify-center" onClick={() => runExport('answer_key', 'pdf')}>เฉลย PDF</button>
          </div>
          {busy && <div className="flex items-center gap-2 text-sm text-neutral-500"><Spinner size="sm" /> กำลังสร้างไฟล์...</div>}
        </div>
      </Modal>
    </div>
  );
}

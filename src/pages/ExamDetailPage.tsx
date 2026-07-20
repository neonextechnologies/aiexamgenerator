import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Eye, Download, Copy, Plus } from 'lucide-react';
import { Card, PageHeader, Badge, Tabs, EmptyState } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, EXAM_TYPE_LABELS } from '../types';

export default function ExamDetailPage() {
  const { examId } = useParams();
  const [tab, setTab] = useState('questions');
  const exam = demoStore.exams.find(e => e.id === examId);
  if (!exam) return <EmptyState title="ไม่พบชุดข้อสอบ" action={<Link to="/exams" className="btn-primary">กลับ</Link>} />;
  const course = demoStore.courses.find(c => c.id === exam.course_id);
  const questions = exam.questions.map(eq => demoStore.questions.find(q => q.id === eq.question_id)).filter(Boolean);

  const tabs = [{ id:'questions', label:'ข้อสอบ', count: questions.length }, { id:'versions', label:'เวอร์ชัน', count: exam.versions.length }, { id:'preview', label:'พรีวิว' }, { id:'settings', label:'ตั้งค่า' }];

  return (
    <div>
      <Link to="/exams" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</Link>
      <PageHeader title={exam.name} description={`${course?.course_code} • ${EXAM_TYPE_LABELS[exam.exam_type]} • ${exam.questions.length} ข้อ • ${exam.total_marks} คะแนน • ${exam.duration_minutes} นาที`} actions={<div className="flex gap-2"><button className="btn-secondary"><Eye className="w-4 h-4" /> พรีวิว</button><button className="btn-secondary"><Download className="w-4 h-4" /> Export</button></div>} />
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
              <Card key={i} className="p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">เวอร์ชัน {v.version_label}</h3><p className="text-xs text-neutral-400">{v.questions.length} ข้อ • Shuffle: {v.shuffle_questions ? 'เปิด' : 'ปิด'} • Shuffle Choices: {v.shuffle_choices ? 'เปิด' : 'ปิด'}</p></div><div className="flex gap-2"><button className="btn-secondary"><Eye className="w-4 h-4" /></button><button className="btn-secondary"><Copy className="w-4 h-4" /></button></div></div></Card>
            ))}
            <button className="btn-primary"><Plus className="w-4 h-4" /> สร้างเวอร์ชันใหม่</button>
          </div>
        )}
        {tab === 'preview' && (
          <Card className="p-8 max-w-3xl mx-auto">
            <div className="text-center mb-6 pb-6 border-b border-neutral-200">
              <h2 className="text-lg font-bold">{course?.course_name_th}</h2><p className="text-sm text-neutral-500 mt-1">{course?.course_code} • {exam.name}</p><p className="text-xs text-neutral-400 mt-2">เวลา {exam.duration_minutes} นาที • คะแนนเต็ม {exam.total_marks} คะแนน</p>
              {exam.instructions && <p className="text-xs text-neutral-500 mt-3 italic">{exam.instructions}</p>}
            </div>
            {questions.map((q, i) => q && (
              <div key={q.id} className="mb-6"><p className="text-sm font-medium mb-2">{i + 1}. {q.question_text}</p>{q.choices && <div className="space-y-1 ml-4">{q.choices.map(c => <p key={c.id} className="text-sm text-neutral-600">{c.id}. {c.text}</p>)}</div>}</div>
            ))}
          </Card>
        )}
        {tab === 'settings' && (
          <Card className="p-5"><p className="text-sm text-neutral-500">ตั้งค่าชุดข้อสอบ — แก้ไขชื่อ คำสั่ง วันสอบ และสถานะ</p></Card>
        )}
      </div>
    </div>
  );
}

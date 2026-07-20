import { Link } from 'react-router-dom';
import { FileCheck, Plus } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { formatDate } from '../lib/utils';
import { EXAM_TYPE_LABELS } from '../types';

export default function ExamsPage() {
  const exams = demoStore.exams;
  return (
    <div>
      <PageHeader title="ชุดข้อสอบ" description="จัดการชุดข้อสอบและหลาย Version" actions={<button className="btn-primary"><Plus className="w-4 h-4" /> สร้างชุดข้อสอบ</button>} />
      {exams.length === 0 ? (
        <EmptyState icon={<FileCheck className="w-12 h-12" />} title="ยังไม่มีชุดข้อสอบ" description="เริ่มสร้างชุดข้อสอบจาก Question Bank" />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map(e => {
            const course = demoStore.courses.find(c => c.id === e.course_id);
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
    </div>
  );
}

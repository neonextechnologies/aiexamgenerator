import { Link } from 'react-router-dom';
import { BookOpen, Plus, Users, Calendar } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState } from '../components/ui';
import { demoStore } from '../lib/demo-data';

export default function CoursesPage() {
  const courses = demoStore.courses;
  return (
    <div>
      <PageHeader title="รายวิชา" description="จัดการรายวิชาและเนื้อหา" actions={<button className="btn-primary"><Plus className="w-4 h-4" /> สร้างรายวิชา</button>} />
      {courses.length === 0 ? (
        <EmptyState icon={<BookOpen className="w-12 h-12" />} title="ยังไม่มีรายวิชา" description="เริ่มสร้างรายวิชาแรกของคุณ" action={<button className="btn-primary"><Plus className="w-4 h-4" /> สร้างรายวิชา</button>} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(c => {
            const cloCount = demoStore.learningOutcomes.filter(lo => lo.course_id === c.id).length;
            const docCount = demoStore.documents.filter(d => d.course_id === c.id).length;
            const qCount = demoStore.questions.filter(q => q.course_id === c.id).length;
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
    </div>
  );
}

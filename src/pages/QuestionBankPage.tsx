import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Search, Eye } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { truncate, formatRelativeTime } from '../lib/utils';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from '../types';


export default function QuestionBankPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [bloomFilter, setBloomFilter] = useState<string>('all');
  const [diffFilter, setDiffFilter] = useState<string>('all');

  let questions = demoStore.questions;
  if (search) questions = questions.filter(q => q.question_text.toLowerCase().includes(search.toLowerCase()) || q.topic?.toLowerCase().includes(search.toLowerCase()));
  if (statusFilter !== 'all') questions = questions.filter(q => q.status === statusFilter);
  if (bloomFilter !== 'all') questions = questions.filter(q => q.intended_bloom_level === bloomFilter);
  if (diffFilter !== 'all') questions = questions.filter(q => q.intended_difficulty === diffFilter);

  return (
    <div>
      <PageHeader title="คลังข้อสอบ" description="ค้นหาและจัดการข้อสอบทั้งหมด" />
      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาข้อสอบ..." className="input pl-10" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input sm:w-40"><option value="all">สถานะทั้งหมด</option>{Object.entries(QUESTION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={bloomFilter} onChange={e => setBloomFilter(e.target.value)} className="input sm:w-40"><option value="all">Bloom ทั้งหมด</option>{Object.entries(BLOOM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={diffFilter} onChange={e => setDiffFilter(e.target.value)} className="input sm:w-40"><option value="all">ความยากทั้งหมด</option>{Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      </Card>
      {questions.length === 0 ? (
        <EmptyState icon={<Library className="w-12 h-12" />} title="ไม่พบข้อสอบ" description="ลองเปลี่ยนตัวกรองหรือสร้างข้อสอบใหม่" action={<Link to="/generate" className="btn-primary">สร้างข้อสอบด้วย AI</Link>} />
      ) : (
        <div className="space-y-2">
          {questions.map(q => {
            return (
              <Link key={q.id} to={`/questions/${q.id}`}><Card hover className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-900">{truncate(q.question_text, 120)}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant={QUESTION_STATUS_BADGE[q.status]}>{QUESTION_STATUS_LABELS[q.status]}</Badge>
                      <Badge variant="neutral">{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
                      <Badge variant="accent">{BLOOM_LABELS[q.intended_bloom_level]}</Badge>
                      <Badge variant="neutral">{DIFFICULTY_LABELS[q.intended_difficulty]}</Badge>
                      {q.quality_score && <span className="text-xs text-neutral-400">Q: {q.quality_score}</span>}
                      <span className="text-xs text-neutral-400">{q.marks} คะแนน</span>
                      <span className="text-xs text-neutral-400">{formatRelativeTime(q.created_at)}</span>
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                </div>
              </Card></Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

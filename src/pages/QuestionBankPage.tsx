import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Search, AlertCircle } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState, Spinner } from '../components/ui';
import { listCourseTags, listCourseTopics, listQuestions } from '../lib/api';
import { truncate, formatRelativeTime } from '../lib/utils';
import { QUESTION_TYPE_LABELS, BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from '../types';
import type { CourseTag, CourseTopic, Question, QuestionType } from '../types';

export default function QuestionBankPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bloomFilter, setBloomFilter] = useState('all');
  const [diffFilter, setDiffFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [tags, setTags] = useState<CourseTag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listQuestions(), listCourseTopics(), listCourseTags()])
      .then(([qs, topicRows, tagRows]) => {
        setAllQuestions(qs);
        setTopics(topicRows);
        setTags(tagRows);
      })
      .finally(() => setLoading(false));
  }, []);

  const topicOptions = useMemo(() => {
    const fromQuestions = allQuestions.map(q => q.topic).filter((t): t is string => !!t);
    return [...new Set([...topics.map(t => t.title), ...fromQuestions])].sort();
  }, [allQuestions, topics]);

  const tagOptions = useMemo(() => {
    const fromQuestions = allQuestions.flatMap(q => q.tags || []);
    return [...new Set([...tags.map(t => t.name), ...fromQuestions])].sort();
  }, [allQuestions, tags]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  let questions = allQuestions;
  if (search) {
    const q = search.toLowerCase();
    questions = questions.filter(item =>
      item.question_text.toLowerCase().includes(q)
      || item.topic?.toLowerCase().includes(q)
      || (item.tags || []).some(tag => tag.toLowerCase().includes(q)),
    );
  }
  if (statusFilter !== 'all') questions = questions.filter(item => item.status === statusFilter);
  if (bloomFilter !== 'all') questions = questions.filter(item => item.intended_bloom_level === bloomFilter);
  if (diffFilter !== 'all') questions = questions.filter(item => item.intended_difficulty === diffFilter);
  if (typeFilter !== 'all') questions = questions.filter(item => item.question_type === typeFilter);
  if (topicFilter !== 'all') questions = questions.filter(item => item.topic === topicFilter);
  if (tagFilter !== 'all') questions = questions.filter(item => (item.tags || []).includes(tagFilter));

  return (
    <div>
      <PageHeader title="คลังข้อสอบ" description="ค้นหาและจัดการข้อสอบทั้งหมด" />
      <Card className="p-4 mb-4">
        <div className="flex flex-col gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาข้อสอบ หัวข้อ หรือแท็ก..." className="input pl-10" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input"><option value="all">สถานะทั้งหมด</option>{Object.entries(QUESTION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input"><option value="all">ประเภททั้งหมด</option>{Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)} className="input"><option value="all">หัวข้อทั้งหมด</option>{topicOptions.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="input"><option value="all">แท็กทั้งหมด</option>{tagOptions.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <select value={bloomFilter} onChange={e => setBloomFilter(e.target.value)} className="input"><option value="all">Bloom ทั้งหมด</option>{Object.entries(BLOOM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={diffFilter} onChange={e => setDiffFilter(e.target.value)} className="input"><option value="all">ความยากทั้งหมด</option>{Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
        </div>
      </Card>
      {questions.length === 0 ? (
        <EmptyState icon={<Library className="w-12 h-12" />} title="ไม่พบข้อสอบ" description="ลองเปลี่ยนตัวกรองหรือสร้างข้อสอบใหม่" action={<Link to="/generate" className="btn-primary">สร้างข้อสอบด้วย AI</Link>} />
      ) : (
        <div className="space-y-2">
          {questions.map(q => (
            <Link key={q.id} to={`/questions/${q.id}`}>
              <Card hover className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-900">{truncate(q.question_text, 140)}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant={QUESTION_STATUS_BADGE[q.status]}>{QUESTION_STATUS_LABELS[q.status]}</Badge>
                      <Badge variant="neutral">{QUESTION_TYPE_LABELS[q.question_type as QuestionType]}</Badge>
                      <Badge variant="accent">{BLOOM_LABELS[q.intended_bloom_level]}</Badge>
                      <Badge variant="neutral">{DIFFICULTY_LABELS[q.intended_difficulty]}</Badge>
                      {q.topic && <Badge variant="neutral">{q.topic}</Badge>}
                      {(q.tags || []).map(tag => <Badge key={tag} variant="primary">{tag}</Badge>)}
                      {(q.quality_flags.includes('duplicate') || q.quality_flags.includes('near_duplicate') || q.near_duplicate_of) && (
                        <Badge variant="warning"><span className="inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> ซ้ำ/ใกล้เคียง</span></Badge>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-2">{formatRelativeTime(q.updated_at || q.created_at)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

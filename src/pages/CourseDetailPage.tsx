import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Plus, ArrowLeft, Target, Settings, Upload, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, Tabs, Badge, PageHeader, EmptyState, Modal, Spinner } from '../components/ui';
import { createBlueprint, createLearningOutcome, getCourse, listLearningOutcomes, listBlueprints, listQuestions, listExams } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fetchCourseDocuments, uploadCourseDocument, deleteCourseDocument } from '../lib/documents';
import { formatDate, formatBytes, truncate } from '../lib/utils';
import { BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_TYPE_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE, EXAM_TYPE_LABELS } from '../types';
import type { BloomLevel, Course, DifficultyLevel, Document as DocType, ExamType, LearningOutcome, QuestionType, TestBlueprint, Question, Exam } from '../types';

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [clos, setClos] = useState<LearningOutcome[]>([]);
  const [blueprints, setBlueprints] = useState<TestBlueprint[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [docs, setDocs] = useState<DocType[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDesc, setFileDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocType | null>(null);
  const [cloOpen, setCloOpen] = useState(false);
  const [bpOpen, setBpOpen] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [cloForm, setCloForm] = useState({ code: '', title: '', description: '', outcome_type: 'CLO' as LearningOutcome['outcome_type'], bloom_level: 'understand' as BloomLevel, weight: 10 });
  const [bpForm, setBpForm] = useState({
    name: '',
    exam_type: 'midterm' as ExamType,
    duration_minutes: 60,
    instructions: '',
    topic: '',
    clo_code: 'CLO1',
    bloom: 'understand' as BloomLevel,
    difficulty: 'medium' as DifficultyLevel,
    question_type: 'multiple_choice_single' as QuestionType,
    num_questions: 5,
    marks_per_question: 1,
  });

  const reloadCourseData = useCallback(async () => {
    if (!courseId) return;
    const [courseRow, outcomeRows, blueprintRows, questionRows, examRows, documentRows] = await Promise.all([
      getCourse(courseId),
      listLearningOutcomes(courseId),
      listBlueprints(courseId),
      listQuestions({ courseId }),
      listExams(courseId),
      fetchCourseDocuments(courseId),
    ]);
    setCourse(courseRow); setClos(outcomeRows); setBlueprints(blueprintRows); setQuestions(questionRows); setExams(examRows); setDocs(documentRows);
  }, [courseId]);

  const loadDocs = useCallback(async () => {
    if (!courseId) return;
    setDocs(await fetchCourseDocuments(courseId));
  }, [courseId]);

  useEffect(() => {
    let active = true;
    if (!courseId) { setLoading(false); return; }
    reloadCourseData().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, reloadCourseData]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!course) return <EmptyState title="ไม่พบรายวิชา" action={<Link to="/courses" className="btn-primary">กลับ</Link>} />;

  const handleUpload = async () => {
    if (!selectedFile || !courseId) return;
    setUploading(true); setUploadMsg(null);
    try {
      const { document, extractionError } = await uploadCourseDocument(courseId, selectedFile, user?.id || 'u-inst', fileDesc || undefined);
      await loadDocs();
      setUploadMsg({ type: 'success', text: `อัปโหลด "${document.file_name}" สำเร็จ${document.extracted_text ? ' และสกัดข้อความเรียบร้อย' : ''}${extractionError ? ` (แจ้งเตือน: ${extractionError})` : ''}` });
      setSelectedFile(null); setFileDesc('');
    } catch (err: unknown) { setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ' }); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    try { await deleteCourseDocument(docToDelete.id, docToDelete.file_path); await loadDocs(); }
    catch (err: unknown) { setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : 'ลบไม่สำเร็จ' }); }
    finally { setDocToDelete(null); }
  };

  const tabs = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'outcomes', label: 'Learning Outcomes', count: clos.length },
    { id: 'documents', label: 'เอกสาร', count: docs.length },
    { id: 'blueprints', label: 'Blueprint', count: blueprints.length },
    { id: 'questions', label: 'ข้อสอบ', count: questions.length },
    { id: 'exams', label: 'ชุดข้อสอบ', count: exams.length },
  ];

  return (
    <div>
      <Link to="/courses" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</Link>
      <PageHeader title={course.course_name_th} description={`${course.course_code} • ${course.course_name_en || ''}`} actions={<button className="btn-secondary"><Settings className="w-4 h-4" /> ตั้งค่า</button>} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'overview' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="p-5 lg:col-span-2">
              <h3 className="font-semibold text-neutral-900 mb-3">รายละเอียดรายวิชา</h3>
              <p className="text-sm text-neutral-600">{course.description}</p>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-neutral-100">
                <div><p className="text-xs text-neutral-400">หน่วยกิต</p><p className="text-sm font-medium">{course.credits} หน่วยกิต</p></div>
                <div><p className="text-xs text-neutral-400">ระดับ</p><p className="text-sm font-medium">{course.level}</p></div>
                <div><p className="text-xs text-neutral-400">คณะ</p><p className="text-sm font-medium">{course.faculty}</p></div>
                <div><p className="text-xs text-neutral-400">ภาคเรียน</p><p className="text-sm font-medium">{course.semester}/{course.academic_year}</p></div>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-neutral-900 mb-3">สถิติ</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-sm text-neutral-500">CLO</span><Badge variant="primary">{clos.length}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-sm text-neutral-500">เอกสาร</span><Badge variant="accent">{docs.length}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-sm text-neutral-500">Blueprint</span><Badge variant="warning">{blueprints.length}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-sm text-neutral-500">ข้อสอบ</span><Badge variant="success">{questions.length}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-sm text-neutral-500">ชุดข้อสอบ</span><Badge variant="primary">{exams.length}</Badge></div>
              </div>
            </Card>
          </div>
        )}
        {tab === 'outcomes' && (
          <div>
            <div className="flex justify-end mb-4"><button className="btn-primary" onClick={() => { setCloOpen(true); setMetaError(null); }}><Plus className="w-4 h-4" /> เพิ่ม CLO</button></div>
            <div className="space-y-3">
              {clos.map(lo => (
                <Card key={lo.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0"><Target className="w-5 h-5 text-primary-600" /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><span className="font-mono text-sm font-semibold text-primary-600">{lo.code}</span><Badge variant="primary">{BLOOM_LABELS[lo.bloom_level || 'remember']}</Badge><Badge variant="neutral">{lo.weight}%</Badge><Badge variant="neutral">{lo.outcome_type}</Badge></div>
                      <p className="text-sm font-medium text-neutral-900 mt-1">{lo.title}</p>
                      <p className="text-sm text-neutral-500 mt-1">{lo.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        {tab === 'documents' && (
          <div>
            <div className="flex justify-end mb-4"><button onClick={() => { setUploadOpen(true); setUploadMsg(null); }} className="btn-primary"><Plus className="w-4 h-4" /> อัปโหลดเอกสาร</button></div>
            {uploadMsg && (
              <div className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${uploadMsg.type === 'success' ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>
                {uploadMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                <span>{uploadMsg.text}</span>
              </div>
            )}
            {docs.length === 0 ? (
              <EmptyState title="ยังไม่มีเอกสาร" description="อัปโหลดไฟล์ PDF, DOCX, TXT หรือ MD เพื่อใช้สร้างข้อสอบ" action={<button onClick={() => setUploadOpen(true)} className="btn-primary"><Upload className="w-4 h-4" /> อัปโหลดไฟล์แรก</button>} />
            ) : (
              <div className="space-y-2">
                {docs.map(d => (
                  <Card key={d.id} className="p-4 flex items-center gap-3">
                    <FileText className="w-5 h-5 text-neutral-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{d.file_name}</p>
                      <p className="text-xs text-neutral-400">{formatBytes(d.file_size)} • {formatDate(d.created_at)}{d.description ? ` • ${d.description}` : ''}</p>
                      {d.extracted_text && <p className="text-xs text-neutral-500 mt-1 truncate">สกัดได้ {d.extracted_text.length} ตัวอักษร</p>}
                    </div>
                    <Badge variant={d.status === 'indexed' ? 'success' : d.status === 'processing' ? 'warning' : d.status === 'failed' ? 'error' : 'neutral'}>{d.status}</Badge>
                    <button onClick={() => setDocToDelete(d)} className="text-neutral-400 hover:text-error-600 transition-colors" title="ลบเอกสาร"><Trash2 className="w-4 h-4" /></button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'blueprints' && (
          <div>
            <div className="flex justify-end mb-4"><button className="btn-primary" onClick={() => { setBpOpen(true); setMetaError(null); setBpForm(f => ({ ...f, clo_code: clos[0]?.code || 'CLO1' })); }}><Plus className="w-4 h-4" /> สร้าง Blueprint</button></div>
            <div className="space-y-3">
              {blueprints.map(bp => (
                <Card key={bp.id} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div><h3 className="font-semibold text-neutral-900">{bp.name}</h3><p className="text-xs text-neutral-400">{bp.total_questions} ข้อ • {bp.total_marks} คะแนน • {bp.duration_minutes} นาที • {EXAM_TYPE_LABELS[bp.exam_type]}</p></div>
                    <Badge variant="success">{bp.status}</Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-neutral-400 border-b border-neutral-100"><th className="py-2 pr-3">Topic</th><th className="py-2 pr-3">CLO</th><th className="py-2 pr-3">Bloom</th><th className="py-2 pr-3">Difficulty</th><th className="py-2 pr-3 text-right">ข้อ</th><th className="py-2 pr-3 text-right">คะแนน</th></tr></thead>
                      <tbody>
                        {bp.rows.map(r => (
                          <tr key={r.id} className="border-b border-neutral-50"><td className="py-2 pr-3">{r.topic}</td><td className="py-2 pr-3">{r.clo_code}</td><td className="py-2 pr-3">{BLOOM_LABELS[r.bloom]}</td><td className="py-2 pr-3">{DIFFICULTY_LABELS[r.difficulty]}</td><td className="py-2 pr-3 text-right">{r.num_questions}</td><td className="py-2 pr-3 text-right">{r.marks_per_question * r.num_questions}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        {tab === 'questions' && (
          <div className="space-y-2">
            {questions.map(q => (
              <Link key={q.id} to={`/questions/${q.id}`}><Card hover className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0"><p className="text-sm text-neutral-900">{truncate(q.question_text, 100)}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap"><Badge variant={QUESTION_STATUS_BADGE[q.status]}>{QUESTION_STATUS_LABELS[q.status]}</Badge><Badge variant="neutral">{QUESTION_TYPE_LABELS[q.question_type]}</Badge><Badge variant="accent">{BLOOM_LABELS[q.intended_bloom_level]}</Badge><Badge variant="neutral">{DIFFICULTY_LABELS[q.intended_difficulty]}</Badge></div>
                  </div>
                </div>
              </Card></Link>
            ))}
          </div>
        )}
        {tab === 'exams' && (
          <div className="space-y-3">
            {exams.map(e => (
              <Link key={e.id} to={`/exams/${e.id}`}><Card hover className="p-4"><div className="flex items-center justify-between"><div><h3 className="font-medium text-neutral-900">{e.name}</h3><p className="text-xs text-neutral-400">{e.questions.length} ข้อ • {e.total_marks} คะแนน • {e.duration_minutes} นาที</p></div><Badge variant="neutral">{e.status}</Badge></div></Card></Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} title="อัปโหลดเอกสารรายวิชา">
        <div className="space-y-4">
          <div>
            <label className="label">ไฟล์เอกสาร (PDF, DOCX, TXT, MD)</label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-neutral-200 border-dashed rounded-lg hover:border-primary-400 transition-colors cursor-pointer" onClick={() => document.getElementById('file-input')?.click()}>
              <div className="text-center">
                {selectedFile ? (
                  <><FileText className="w-10 h-10 text-primary-500 mx-auto mb-2" /><p className="text-sm font-medium text-neutral-900">{selectedFile.name}</p><p className="text-xs text-neutral-400 mt-1">{formatBytes(selectedFile.size)}</p></>
                ) : (
                  <><Upload className="w-10 h-10 text-neutral-300 mx-auto mb-2" /><p className="text-sm text-neutral-500">คลิกเพื่อเลือกไฟล์</p><p className="text-xs text-neutral-400 mt-1">รองรับ PDF, DOCX, TXT, MD (สูงสุด 20MB)</p></>
                )}
              </div>
            </div>
            <input id="file-input" type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="label">คำอธิบาย (ไม่บังคับ)</label>
            <input type="text" value={fileDesc} onChange={e => setFileDesc(e.target.value)} placeholder="เช่น หลักสูตรรายวิชา, โน้ตบรรยาย..." className="input" />
          </div>
          {uploadMsg && (
            <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${uploadMsg.type === 'success' ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>
              {uploadMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <span>{uploadMsg.text}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setUploadOpen(false); setSelectedFile(null); setFileDesc(''); setUploadMsg(null); }} disabled={uploading} className="btn-secondary">ยกเลิก</button>
            <button onClick={handleUpload} disabled={!selectedFile || uploading} className="btn-primary">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังอัปโหลดและสกัดข้อความ...</> : <><Upload className="w-4 h-4" /> อัปโหลด</>}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!docToDelete} onClose={() => setDocToDelete(null)} title="ยืนยันการลบ">
        <p className="text-sm text-neutral-600">ต้องการลบเอกสาร "{docToDelete?.file_name}" ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้</p>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={() => setDocToDelete(null)} className="btn-secondary">ยกเลิก</button>
          <button onClick={handleDelete} className="btn-primary bg-error-600 hover:bg-error-700">ลบ</button>
        </div>
      </Modal>

      <Modal open={cloOpen} onClose={() => !savingMeta && setCloOpen(false)} title="เพิ่ม Learning Outcome">
        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label">รหัส</label><input className="input" value={cloForm.code} onChange={e => setCloForm({ ...cloForm, code: e.target.value })} placeholder="CLO4" /></div>
            <div>
              <label className="label">ประเภท</label>
              <select className="input" value={cloForm.outcome_type} onChange={e => setCloForm({ ...cloForm, outcome_type: e.target.value as LearningOutcome['outcome_type'] })}>
                <option value="CLO">CLO</option>
                <option value="LO">LO</option>
                <option value="PLO">PLO</option>
                <option value="topic">topic</option>
              </select>
            </div>
          </div>
          <div><label className="label">ชื่อ</label><input className="input" value={cloForm.title} onChange={e => setCloForm({ ...cloForm, title: e.target.value })} /></div>
          <div><label className="label">คำอธิบาย</label><textarea className="input min-h-20" value={cloForm.description} onChange={e => setCloForm({ ...cloForm, description: e.target.value })} /></div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label">Bloom</label><select className="input" value={cloForm.bloom_level} onChange={e => setCloForm({ ...cloForm, bloom_level: e.target.value as BloomLevel })}>{Object.entries(BLOOM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="label">น้ำหนัก (%)</label><input className="input" type="number" value={cloForm.weight} onChange={e => setCloForm({ ...cloForm, weight: Number(e.target.value) || 0 })} /></div>
          </div>
          {metaError && <p className="text-sm text-error-600">{metaError}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" disabled={savingMeta} onClick={() => setCloOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={savingMeta} onClick={async () => {
              if (!courseId || !cloForm.code.trim() || !cloForm.title.trim()) { setMetaError('กรุณากรอกรหัสและชื่อ'); return; }
              setSavingMeta(true); setMetaError(null);
              try {
                await createLearningOutcome({ course_id: courseId, ...cloForm });
                setCloOpen(false);
                setCloForm({ code: '', title: '', description: '', outcome_type: 'CLO', bloom_level: 'understand', weight: 10 });
                await reloadCourseData();
              } catch (err) {
                setMetaError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
              } finally {
                setSavingMeta(false);
              }
            }}>{savingMeta ? <Spinner size="sm" /> : 'บันทึก'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={bpOpen} onClose={() => !savingMeta && setBpOpen(false)} title="สร้าง Blueprint" size="lg">
        <div className="space-y-3">
          <div><label className="label">ชื่อ Blueprint</label><input className="input" value={bpForm.name} onChange={e => setBpForm({ ...bpForm, name: e.target.value })} /></div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label">ประเภทสอบ</label><select className="input" value={bpForm.exam_type} onChange={e => setBpForm({ ...bpForm, exam_type: e.target.value as ExamType })}>{Object.entries(EXAM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="label">เวลา (นาที)</label><input className="input" type="number" value={bpForm.duration_minutes} onChange={e => setBpForm({ ...bpForm, duration_minutes: Number(e.target.value) || 0 })} /></div>
          </div>
          <div><label className="label">คำชี้แจง</label><textarea className="input min-h-16" value={bpForm.instructions} onChange={e => setBpForm({ ...bpForm, instructions: e.target.value })} /></div>
          <div className="p-3 rounded-lg border border-neutral-200 space-y-3">
            <p className="text-sm font-medium">แถว Blueprint แรก</p>
            <div className="grid md:grid-cols-2 gap-3">
              <div><label className="label">Topic</label><input className="input" value={bpForm.topic} onChange={e => setBpForm({ ...bpForm, topic: e.target.value })} /></div>
              <div><label className="label">CLO</label><select className="input" value={bpForm.clo_code} onChange={e => setBpForm({ ...bpForm, clo_code: e.target.value })}>{clos.map(lo => <option key={lo.id} value={lo.code}>{lo.code}</option>)}{!clos.length && <option value="CLO1">CLO1</option>}</select></div>
              <div><label className="label">Bloom</label><select className="input" value={bpForm.bloom} onChange={e => setBpForm({ ...bpForm, bloom: e.target.value as BloomLevel })}>{Object.entries(BLOOM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label">Difficulty</label><select className="input" value={bpForm.difficulty} onChange={e => setBpForm({ ...bpForm, difficulty: e.target.value as DifficultyLevel })}>{Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label">ประเภทข้อสอบ</label><select className="input" value={bpForm.question_type} onChange={e => setBpForm({ ...bpForm, question_type: e.target.value as QuestionType })}>{Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">จำนวนข้อ</label><input className="input" type="number" value={bpForm.num_questions} onChange={e => setBpForm({ ...bpForm, num_questions: Number(e.target.value) || 0 })} /></div>
                <div><label className="label">คะแนน/ข้อ</label><input className="input" type="number" value={bpForm.marks_per_question} onChange={e => setBpForm({ ...bpForm, marks_per_question: Number(e.target.value) || 0 })} /></div>
              </div>
            </div>
          </div>
          {metaError && <p className="text-sm text-error-600">{metaError}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" disabled={savingMeta} onClick={() => setBpOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={savingMeta} onClick={async () => {
              if (!courseId || !bpForm.name.trim() || !bpForm.topic.trim()) { setMetaError('กรุณากรอกชื่อและหัวข้อ'); return; }
              setSavingMeta(true); setMetaError(null);
              try {
                await createBlueprint({
                  course_id: courseId,
                  name: bpForm.name,
                  exam_type: bpForm.exam_type,
                  duration_minutes: bpForm.duration_minutes,
                  instructions: bpForm.instructions,
                  rows: [{
                    topic: bpForm.topic,
                    clo_code: bpForm.clo_code,
                    bloom: bpForm.bloom,
                    difficulty: bpForm.difficulty,
                    question_type: bpForm.question_type,
                    num_questions: bpForm.num_questions,
                    marks_per_question: bpForm.marks_per_question,
                  }],
                });
                setBpOpen(false);
                await reloadCourseData();
              } catch (err) {
                setMetaError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
              } finally {
                setSavingMeta(false);
              }
            }}>{savingMeta ? <Spinner size="sm" /> : 'สร้าง Blueprint'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

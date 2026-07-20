import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, Plus, ArrowLeft, Target, Settings, Upload, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, Tabs, Badge, PageHeader, EmptyState, Modal } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { useAuth } from '../lib/auth';
import { fetchCourseDocuments, uploadCourseDocument, deleteCourseDocument } from '../lib/documents';
import { formatDate, formatBytes, truncate } from '../lib/utils';
import { BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_TYPE_LABELS, QUESTION_STATUS_LABELS, QUESTION_STATUS_BADGE } from '../types';
import type { Document as DocType } from '../types';

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const course = demoStore.courses.find(c => c.id === courseId);
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [docs, setDocs] = useState<DocType[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDesc, setFileDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocType | null>(null);

  const loadDocs = useCallback(async () => {
    if (!courseId) return;
    try {
      const fetched = await fetchCourseDocuments(courseId);
      setDocs(fetched);
    } catch {
      setDocs(demoStore.documents.filter(d => d.course_id === courseId));
    }
  }, [courseId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  if (!course) return <EmptyState title="ไม่พบรายวิชา" action={<Link to="/courses" className="btn-primary">กลับ</Link>} />;

  const clos = demoStore.learningOutcomes.filter(lo => lo.course_id === course.id);
  const blueprints = demoStore.blueprints.filter(b => b.course_id === course.id);
  const questions = demoStore.questions.filter(q => q.course_id === course.id);
  const exams = demoStore.exams.filter(e => e.course_id === course.id);

  const handleUpload = async () => {
    if (!selectedFile || !courseId) return;
    setUploading(true); setUploadMsg(null);
    try {
      const { document, extractionError } = await uploadCourseDocument(courseId, selectedFile, user?.id || 'u-inst', fileDesc || undefined);
      await loadDocs();
      setUploadMsg({ type: 'success', text: `อัปโหลด "${document.file_name}" สำเร็จ${document.extracted_text ? ' และสกัดข้อความเรียบร้อย' : ''}${extractionError ? ` (แจ้งเตือน: ${extractionError})` : ''}` });
      setSelectedFile(null); setFileDesc('');
    } catch (err: any) { setUploadMsg({ type: 'error', text: err.message || 'อัปโหลดไม่สำเร็จ' }); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    try { await deleteCourseDocument(docToDelete.id, docToDelete.file_path); await loadDocs(); }
    catch (err: any) { setUploadMsg({ type: 'error', text: err.message || 'ลบไม่สำเร็จ' }); }
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
            <div className="flex justify-end mb-4"><button className="btn-primary"><Plus className="w-4 h-4" /> เพิ่ม CLO</button></div>
            <div className="space-y-3">
              {clos.map(lo => (
                <Card key={lo.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0"><Target className="w-5 h-5 text-primary-600" /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><span className="font-mono text-sm font-semibold text-primary-600">{lo.code}</span><Badge variant="primary">{BLOOM_LABELS[lo.bloom_level || 'remember']}</Badge><Badge variant="neutral">{lo.weight}%</Badge></div>
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
            <div className="flex justify-end mb-4"><button className="btn-primary"><Plus className="w-4 h-4" /> สร้าง Blueprint</button></div>
            <div className="space-y-3">
              {blueprints.map(bp => (
                <Card key={bp.id} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div><h3 className="font-semibold text-neutral-900">{bp.name}</h3><p className="text-xs text-neutral-400">{bp.total_questions} ข้อ • {bp.total_marks} คะแนน • {bp.duration_minutes} นาที</p></div>
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
    </div>
  );
}

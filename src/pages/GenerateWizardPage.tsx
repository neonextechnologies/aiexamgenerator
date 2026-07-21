import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Check, FileText, Target, ChevronRight, ChevronLeft, AlertCircle, Zap } from 'lucide-react';
import { Card, PageHeader, Badge, ProgressBar } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { DemoAIProvider } from '../lib/ai-provider';
import { supabase, isDemoMode } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BLOOM_LABELS, DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '../types';
import type { QuestionType, BloomLevel, DifficultyLevel, Language, GeneratedQuestion } from '../types';

const STEPS = ['เลือกรายวิชา', 'เลือกแหล่งเนื้อหา', 'เลือก Learning Outcomes', 'กำหนดข้อสอบ', 'ตรวจสอบแผน', 'สร้างข้อสอบ'];

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const EDGE_HEADERS = {
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export default function GenerateWizardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [courseId, setCourseId] = useState('');
  const [docIds, setDocIds] = useState<string[]>([]);
  const [loIds, setLoIds] = useState<string[]>([]);
  const [qType, setQType] = useState<QuestionType>('multiple_choice_single');
  const [bloom, setBloom] = useState<BloomLevel>('apply');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [num, setNum] = useState(5);
  const [language, setLanguage] = useState<Language>('th');
  const [marks, setMarks] = useState(1);
  const [includeExp, setIncludeExp] = useState(true);
  const [includeRubric, setIncludeRubric] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generated, setGenerated] = useState<GeneratedQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usageInfo, setUsageInfo] = useState<{ model: string; totalTokens: number; costUsd: number } | null>(null);
  const [usedDemoFallback, setUsedDemoFallback] = useState(false);

  const courses = demoStore.courses;
  const docs = courseId ? demoStore.documents.filter(d => d.course_id === courseId) : [];
  const los = courseId ? demoStore.learningOutcomes.filter(lo => lo.course_id === courseId) : [];

  const toggle = (arr: string[], id: string, setter: (v: string[]) => void) => {
    setter(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  };

  const canNext = () => {
    if (step === 0) return !!courseId;
    if (step === 1) return docIds.length > 0;
    if (step === 2) return loIds.length > 0;
    if (step === 3) return num > 0 && num <= 30;
    return true;
  };

  const mapAiQuestion = (q: any): GeneratedQuestion => ({
    questionText: q.questionText || '',
    questionType: q.questionType || qType,
    language: q.language || language,
    choices: q.choices ? q.choices.map((c: any) => ({
      id: c.id || c._id || '',
      text: c.text || '',
      is_correct: c.isCorrect ?? c.is_correct ?? false,
      rationale: c.rationale || '',
    })) : undefined,
    correctAnswer: q.correctAnswer || q.correct_answer || '',
    explanation: q.explanation || '',
    bloomLevel: q.bloomLevel || bloom,
    difficulty: q.difficulty || difficulty,
    learningOutcomeCodes: q.learningOutcomeCodes || loIds,
    topic: q.topic || undefined,
    marks: q.marks || marks,
    estimatedAnswerTimeMinutes: q.estimatedAnswerTimeMinutes || (difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3),
    sourceReferences: q.sourceReference ? [{ document_id: '', file_name: q.sourceReference, page: 0, section: '', quote: null }] : [],
    rubric: q.rubric || undefined,
    qualityFlags: q.qualityFlags || [],
  });

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setProgress(0);
    setGenerated([]);
    setUsageInfo(null);
    setUsedDemoFallback(false);

    try {
      const cloCodes = loIds;

      let documentTexts: { fileName: string; text: string }[] = [];
      if (!isDemoMode && supabase) {
        const { data: docRows } = await supabase
          .from('documents')
          .select('id, file_name, extracted_text')
          .in('id', docIds);
        documentTexts = (docRows || [])
          .filter((d: any) => d.extracted_text)
          .map((d: any) => ({ fileName: d.file_name, text: d.extracted_text }));
      }

      if (documentTexts.length === 0) {
        documentTexts = docIds.map(id => {
          const demoDoc = demoStore.documents.find(d => d.id === id);
          return { fileName: demoDoc?.file_name || id, text: demoDoc?.extracted_text || `เนื้อหาตัวอย่างเกี่ยวกับเทคโนโลยีดิจิทัลเพื่อการศึกษา ครอบคลุม ${demoDoc?.description || ''}` };
        });
      }

      let allQs: GeneratedQuestion[] = [];
      let model = 'demo-model';
      let totalTokens = 0;
      let costUsd = 0;

      if (!isDemoMode) {
        try {
          setProgress(10);
          const resp = await fetch(`${EDGE_BASE}/generate-questions`, {
            method: 'POST',
            headers: EDGE_HEADERS,
            body: JSON.stringify({
              courseId, documentTexts, learningOutcomeCodes: cloCodes, questionType: qType, bloomLevel: bloom, difficulty, numberOfQuestions: num, language, marksPerQuestion: marks, includeExplanation: includeExp, includeRubric, createdBy: user?.id || 'u-inst',
            }),
          });
          const result = await resp.json();
          setProgress(70);

          if (resp.ok && result.success && result.questions) {
            allQs = result.questions.map(mapAiQuestion);
            model = result.usage?.model || 'gpt-4o';
            totalTokens = result.usage?.totalTokens || 0;
            costUsd = result.usage?.estimatedCostUsd || 0;
            setProgress(100);
          } else if (result.demoMode) {
            setUsedDemoFallback(true);
            const provider = new DemoAIProvider();
            const batchResult = await provider.generateQuestions({
              courseId, documentIds: docIds, learningOutcomeIds: loIds, questionType: qType, bloomLevel: bloom, difficulty, numberOfQuestions: num, language, marksPerQuestion: marks, includeExplanation: includeExp, includeRubric: includeRubric,
            });
            allQs = batchResult.questions;
            model = batchResult.model;
            totalTokens = batchResult.inputTokens + batchResult.outputTokens;
            setProgress(100);
          } else {
            throw new Error(result.error || `Edge function returned ${resp.status}`);
          }
        } catch (err: any) {
          setUsedDemoFallback(true);
          const provider = new DemoAIProvider();
          const batchResult = await provider.generateQuestions({
            courseId, documentIds: docIds, learningOutcomeIds: loIds, questionType: qType, bloomLevel: bloom, difficulty, numberOfQuestions: num, language, marksPerQuestion: marks, includeExplanation: includeExp, includeRubric: includeRubric,
          });
          allQs = batchResult.questions;
          model = 'demo-model (fallback)';
          totalTokens = batchResult.inputTokens + batchResult.outputTokens;
          setProgress(100);
        }
      } else {
        const provider = new DemoAIProvider();
        const batchSize = 5;
        const batches = Math.ceil(num / batchSize);
        for (let b = 0; b < batches; b++) {
          const batchNum = Math.min(batchSize, num - b * batchSize);
          const result = await provider.generateQuestions({
            courseId, documentIds: docIds, learningOutcomeIds: loIds, questionType: qType, bloomLevel: bloom, difficulty, numberOfQuestions: batchNum, language, marksPerQuestion: marks, includeExplanation: includeExp, includeRubric: includeRubric,
          });
          allQs.push(...result.questions);
          setProgress(Math.round(((b + 1) / batches) * 100));
        }
        model = 'demo-model';
        totalTokens = 2000 + num * 700;
      }

      setGenerated(allQs);
      setUsageInfo({ model, totalTokens, costUsd });

      allQs.forEach((gq, i) => {
        demoStore.questions.push({
          id: `q-gen-${Date.now()}-${i}`, course_id: courseId, question_type: gq.questionType, question_text: gq.questionText, language: gq.language, topic: gq.topic,
          choices: gq.choices || null, correct_answer: gq.correctAnswer, explanation: gq.explanation,
          intended_bloom_level: gq.bloomLevel, ai_predicted_bloom_level: gq.bloomLevel, reviewer_confirmed_bloom_level: null,
          intended_difficulty: gq.difficulty, ai_predicted_difficulty: gq.difficulty, reviewer_confirmed_difficulty: null,
          marks: gq.marks, estimated_answer_time_minutes: gq.estimatedAnswerTimeMinutes,
          source_references: gq.sourceReferences || null, rubric: gq.rubric || null, learning_outcome_codes: gq.learningOutcomeCodes,
          quality_flags: gq.qualityFlags, quality_score: 85, status: 'ai_generated', source_type: 'ai_generated', created_by: 'u-inst', generated_by_ai: true, ai_model: model,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), used_count: 0, exposure_level: 'new',
        });
      });
      demoStore.generationJobs.push({
        id: `job-${Date.now()}`, course_id: courseId, document_ids: docIds, learning_outcome_ids: loIds, question_type: qType, bloom_level: bloom, difficulty, number_of_questions: num, language, marks_per_question: marks, include_explanation: includeExp, include_rubric: includeRubric,
        status: 'completed', generated_count: allQs.length, failed_count: 0, total_questions: num, created_by: 'u-inst', created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
        input_tokens: Math.round(totalTokens * 0.4), output_tokens: Math.round(totalTokens * 0.6), estimated_cost_usd: costUsd, model,
      });
    } catch (e) {
      setError('เกิดข้อผิดพลาดในการสร้างข้อสอบ กรุณาลองใหม่');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <PageHeader title="สร้างข้อสอบด้วย AI" description="สร้างข้อสอบจากเอกสารและ Learning Outcomes โดยใช้ปัญญาประดิษฐ์" />
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2 flex-shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${i === step ? 'bg-primary-600 text-white' : i < step ? 'bg-success-100 text-success-700' : 'bg-neutral-100 text-neutral-400'}`}>
              {i < step ? <Check className="w-3.5 h-3.5" /> : <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs">{i + 1}</span>}
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-neutral-300" />}
          </div>
        ))}
      </div>

      <Card className="p-6 max-w-3xl">
        {step === 0 && (
          <div>
            <h3 className="font-semibold text-neutral-900 mb-4">เลือกรายวิชา</h3>
            <div className="space-y-2">
              {courses.map(c => (
                <button key={c.id} onClick={() => setCourseId(c.id)} className={`w-full text-left p-4 rounded-lg border transition-colors ${courseId === c.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                  <div className="flex items-center justify-between"><div><p className="font-mono text-sm text-primary-600">{c.course_code}</p><p className="font-medium text-neutral-900">{c.course_name_th}</p><p className="text-xs text-neutral-400">{c.semester}/{c.academic_year}</p></div>{courseId === c.id && <Check className="w-5 h-5 text-primary-600" />}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <h3 className="font-semibold text-neutral-900 mb-4">เลือกแหล่งเนื้อหา</h3>
            <p className="text-sm text-neutral-500 mb-4">เลือกเอกสารที่จะใช้เป็นฐานความรู้สำหรับสร้างข้อสอบ</p>
            <div className="space-y-2">
              {docs.map(d => (
                <button key={d.id} onClick={() => toggle(docIds, d.id, setDocIds)} className={`w-full text-left p-3 rounded-lg border flex items-center gap-3 transition-colors ${docIds.includes(d.id) ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                  <FileText className="w-5 h-5 text-neutral-400" />
                  <div className="flex-1"><p className="text-sm font-medium text-neutral-900">{d.file_name}</p><p className="text-xs text-neutral-400">{d.status === 'indexed' ? 'พร้อมใช้งาน' : d.status}</p></div>
                  {docIds.includes(d.id) && <Check className="w-5 h-5 text-primary-600" />}
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <h3 className="font-semibold text-neutral-900 mb-4">เลือก Learning Outcomes</h3>
            <p className="text-sm text-neutral-500 mb-4">เลือก CLO ที่ข้อสอบจะอ้างอิง</p>
            <div className="space-y-2">
              {los.map(lo => (
                <button key={lo.id} onClick={() => toggle(loIds, lo.id, setLoIds)} className={`w-full text-left p-3 rounded-lg border flex items-center gap-3 transition-colors ${loIds.includes(lo.id) ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                  <Target className="w-5 h-5 text-neutral-400" />
                  <div className="flex-1"><p className="font-mono text-sm text-primary-600">{lo.code}</p><p className="text-sm font-medium text-neutral-900">{lo.title}</p><p className="text-xs text-neutral-400">{BLOOM_LABELS[lo.bloom_level || 'remember']} • {lo.weight}%</p></div>
                  {loIds.includes(lo.id) && <Check className="w-5 h-5 text-primary-600" />}
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-neutral-900 mb-4">กำหนดข้อสอบ</h3>
            <div><label className="label">ชนิดข้อสอบ</label><select value={qType} onChange={e => setQType(e.target.value as QuestionType)} className="input">{Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Bloom's Taxonomy</label><select value={bloom} onChange={e => setBloom(e.target.value as BloomLevel)} className="input">{Object.entries(BLOOM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label">ระดับความยาก</label><select value={difficulty} onChange={e => setDifficulty(e.target.value as DifficultyLevel)} className="input">{Object.entries(DIFFICULTY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="label">จำนวนข้อ</label><input type="number" min={1} max={30} value={num} onChange={e => setNum(Number(e.target.value))} className="input" /></div>
              <div><label className="label">คะแนน/ข้อ</label><input type="number" min={1} value={marks} onChange={e => setMarks(Number(e.target.value))} className="input" /></div>
              <div><label className="label">ภาษา</label><select value={language} onChange={e => setLanguage(e.target.value as Language)} className="input"><option value="th">ไทย</option><option value="en">English</option></select></div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={includeExp} onChange={e => setIncludeExp(e.target.checked)} className="rounded" /> <span className="text-sm">รวมคำอธิบาย/เฉลย</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={includeRubric} onChange={e => setIncludeRubric(e.target.checked)} className="rounded" /> <span className="text-sm">รวม Rubric (สำหรับอัตนัย)</span></label>
            </div>
          </div>
        )}
        {step === 4 && (
          <div>
            <h3 className="font-semibold text-neutral-900 mb-4">ตรวจสอบแผนการสร้าง</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">รายวิชา</span><span className="font-medium">{courses.find(c => c.id === courseId)?.course_code}</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">เอกสาร</span><span className="font-medium">{docIds.length} ไฟล์</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">CLO</span><span className="font-medium">{loIds.length} รายการ</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">ชนิดข้อสอบ</span><span className="font-medium">{QUESTION_TYPE_LABELS[qType]}</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">Bloom</span><span className="font-medium">{BLOOM_LABELS[bloom]}</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">ความยาก</span><span className="font-medium">{DIFFICULTY_LABELS[difficulty]}</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-100"><span className="text-neutral-500">จำนวน</span><span className="font-medium">{num} ข้อ × {marks} คะแนน = {num * marks} คะแนน</span></div>
              <div className="flex justify-between py-2"><span className="text-neutral-500">Est. AI Usage</span><span className="font-medium">~{2000 + num * 300} input + {2500 + num * 400} output tokens</span></div>
            </div>
          </div>
        )}
        {step === 5 && (
          <div>
            <h3 className="font-semibold text-neutral-900 mb-4">สร้างข้อสอบ</h3>
            {generating ? (
              <div className="text-center py-8">
                <Zap className="w-10 h-10 text-primary-500 mx-auto mb-3 animate-pulse" />
                <p className="mt-4 text-sm text-neutral-500">AI กำลังสร้างข้อสอบ... {progress}%</p>
                <div className="max-w-xs mx-auto mt-4"><ProgressBar value={progress} /></div>
                <p className="mt-2 text-xs text-neutral-400">สร้างแล้ว {generated.length}/{num} ข้อ</p>
              </div>
            ) : generated.length > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-4 text-success-600"><Check className="w-5 h-5" /><span className="font-medium">สร้างข้อสอบเสร็จสิ้น</span></div>
                {usedDemoFallback && (
                  <div className="mb-4 p-3 rounded-lg bg-warning-50 text-warning-700 text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>ไม่พบ OpenAI API key ใน Supabase secrets — ใช้ Demo AI สร้างข้อสอบตัวอย่างแทน เพื่อใช้ AI จริง ให้ตั้งค่า <code className="bg-warning-100 px-1 rounded">OPENAI_API_KEY</code> ใน Supabase Edge Function secrets</span>
                  </div>
                )}
                <p className="text-sm text-neutral-500 mb-4">AI สร้างข้อสอบ {generated.length} ข้อ ข้อสอบถูกบันทึกเป็น Draft และพร้อมตรวจสอบ</p>
                {usageInfo && (
                  <div className="mb-4 p-3 rounded-lg bg-neutral-50 border border-neutral-100 text-xs text-neutral-500 flex flex-wrap gap-4">
                    <span>Model: <strong className="text-neutral-700">{usageInfo.model}</strong></span>
                    <span>Tokens: <strong className="text-neutral-700">{usageInfo.totalTokens.toLocaleString()}</strong></span>
                    {usageInfo.costUsd > 0 && <span>Est. cost: <strong className="text-neutral-700">${usageInfo.costUsd.toFixed(4)}</strong></span>}
                  </div>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {generated.map((q, i) => (
                    <div key={i} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100"><p className="text-sm text-neutral-900">{i + 1}. {q.questionText.slice(0, 100)}...</p><div className="flex gap-2 mt-1"><Badge variant="primary">{BLOOM_LABELS[q.bloomLevel]}</Badge><Badge variant="neutral">{DIFFICULTY_LABELS[q.difficulty]}</Badge></div></div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4"><button onClick={() => navigate('/question-bank')} className="btn-primary">ไปยังคลังข้อสอบ</button><button onClick={() => navigate('/review')} className="btn-secondary">ตรวจข้อสอบ</button></div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Sparkles className="w-12 h-12 text-primary-300 mx-auto mb-4" />
                <p className="text-sm text-neutral-500 mb-4">พร้อมสร้างข้อสอบ {num} ข้อ ด้วย AI</p>
                {error && <p className="text-sm text-error-600 mb-4">{error}</p>}
                <button onClick={handleGenerate} className="btn-primary"><Sparkles className="w-4 h-4" /> เริ่มสร้างข้อสอบ</button>
              </div>
            )}
          </div>
        )}

        {step < 5 && (
          <div className="flex justify-between mt-6 pt-4 border-t border-neutral-100">
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> ย้อนกลับ</button>
            {step < 4 ? <button onClick={() => setStep(step + 1)} disabled={!canNext()} className="btn-primary">ถัดไป <ChevronRight className="w-4 h-4" /></button> : <button onClick={() => setStep(5)} disabled={!canNext()} className="btn-primary">ไปยังการสร้าง <ChevronRight className="w-4 h-4" /></button>}
          </div>
        )}
      </Card>
    </div>
  );
}

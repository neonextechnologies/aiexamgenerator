import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Bot, Check, ChevronLeft, ChevronRight, FileText, Hand, Sparkles, Target, Users } from 'lucide-react';
import { Badge, Card, PageHeader, ProgressBar, Spinner } from '../components/ui';
import { fetchCourseDocuments } from '../lib/documents';
import { listCourses, listLearningOutcomes } from '../lib/api';
import { useAuth } from '../lib/auth';
import { aiOrchestrator, ruleEngine } from '../services';
import { BLOOM_LABELS } from '../types';
import type { BloomLevel, Course, DifficultyLevel, Document, Language, LearningOutcome, QuestionType } from '../types';
import type { AIProviderConfig, DifficultyDefinition, GenerationMode, GenerationV2Result, QuestionTypeDef, Rule, RuleSet } from '../types/v2';

const STEPS = ['รายวิชา', 'แหล่งความรู้', 'Learning Outcomes', 'โหมด', 'ตั้งค่า', 'กฎ', 'ตรวจสอบแผน', 'สร้าง'];
const MODES: Array<{ id: GenerationMode; title: string; description: string; icon: typeof Hand }> = [
  { id: 'manual', title: 'Manual', description: 'ผู้สอนสร้างและควบคุมเนื้อหาทั้งหมด', icon: Hand },
  { id: 'hybrid', title: 'Hybrid', description: 'ผู้สอนกำหนดโครงสร้าง แล้ว AI ช่วยร่างภายใต้กฎ', icon: Users },
  { id: 'ai', title: 'AI', description: 'ใช้ pipeline Retrieve → Analyze → Generate → Verify', icon: Bot },
];

export default function GenerateWizardV2() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [outcomes, setOutcomes] = useState<LearningOutcome[]>([]);
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeDef[]>([]);
  const [difficulties, setDifficulties] = useState<DifficultyDefinition[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [courseId, setCourseId] = useState(searchParams.get('courseId') || '');
  const [docIds, setDocIds] = useState<string[]>([]);
  const [loIds, setLoIds] = useState<string[]>([]);
  const [mode, setMode] = useState<GenerationMode>('hybrid');
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice_single');
  const [bloom, setBloom] = useState<BloomLevel>('apply');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);
  const [language, setLanguage] = useState<Language>('th');
  const [marks, setMarks] = useState(1);
  const [includeExplanation, setIncludeExplanation] = useState(true);
  const [includeRubric, setIncludeRubric] = useState(false);
  const [knowledgeBounded, setKnowledgeBounded] = useState(true);
  const [providerId, setProviderId] = useState('');
  const [ruleSetId, setRuleSetId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [result, setResult] = useState<GenerationV2Result | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      listCourses(),
      aiOrchestrator.listProviders(),
      aiOrchestrator.listQuestionTypes(),
      aiOrchestrator.listDifficulties(),
      ruleEngine.listRuleSets(),
    ]).then(([courseRows, providerRows, typeRows, difficultyRows, setRows]) => {
      setCourses(courseRows);
      setProviders(providerRows);
      setQuestionTypes(typeRows);
      setDifficulties(difficultyRows);
      setRuleSets(setRows);
      setProviderId(providerRows.find(provider => provider.is_enabled)?.id || providerRows[0]?.id || '');
      setRuleSetId(setRows[0]?.id || '');
      if (typeRows[0]?.code) setQuestionType(typeRows[0].code as QuestionType);
      if (difficultyRows[0]?.code) setDifficulty(difficultyRows[0].code as DifficultyLevel);
    }).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลเริ่มต้นไม่สำเร็จ');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setDocIds([]);
    setLoIds([]);
    if (!courseId) {
      setDocs([]);
      setOutcomes([]);
      return;
    }
    Promise.all([fetchCourseDocuments(courseId), listLearningOutcomes(courseId)])
      .then(([documentRows, outcomeRows]) => {
        setDocs(documentRows);
        setOutcomes(outcomeRows);
      });
  }, [courseId]);

  useEffect(() => {
    if (!ruleSetId) return setRules([]);
    ruleEngine.getRulesForSet(ruleSetId).then(setRules).catch(() => setRules([]));
  }, [ruleSetId]);

  const toggle = (items: string[], id: string, setter: (value: string[]) => void) => {
    setter(items.includes(id) ? items.filter(item => item !== id) : [...items, id]);
  };

  const canContinue = () => {
    if (step === 0) return Boolean(courseId);
    if (step === 1) return !knowledgeBounded || docIds.length > 0;
    if (step === 2) return loIds.length > 0;
    if (step === 4) return numberOfQuestions > 0 && numberOfQuestions <= 30 && questionTypes.length > 0 && difficulties.length > 0;
    return true;
  };

  const generate = async () => {
    setGenerating(true);
    setResult(null);
    setError('');
    setProgressPct(0);
    setProgressStage('QUEUED');
    try {
      const generationResult = await aiOrchestrator.runGeneration({
        mode,
        courseId,
        documentIds: docIds,
        learningOutcomeIds: loIds,
        learningOutcomeCodes: outcomes.filter(outcome => loIds.includes(outcome.id)).map(outcome => outcome.code),
        questionType,
        bloomLevel: bloom,
        difficulty,
        numberOfQuestions,
        language,
        marksPerQuestion: marks,
        includeExplanation,
        includeRubric,
        knowledgeBounded,
        providerId: providerId || null,
        ruleSetId: ruleSetId || null,
        createdBy: user?.id || 'unknown',
      }, {
        onProgress: (update) => {
          setProgressPct(update.progressPct);
          setProgressStage(update.stageMessage || update.currentStage);
        },
      });
      setResult(generationResult);
      setProgressPct(100);
      if (!generationResult.success) setError(generationResult.error || 'ระบบไม่สามารถสร้างข้อสอบตามแผนได้');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เกิดข้อผิดพลาดในการสร้างข้อสอบ');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div>
      <PageHeader title="สร้างข้อสอบ" description="เลือก Manual, Hybrid หรือ AI พร้อมควบคุมแหล่งความรู้ กฎ และการตรวจสอบ" />
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {STEPS.map((label, index) => <div key={label} className="flex items-center gap-2 flex-shrink-0"><div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${index === step ? 'bg-primary-600 text-white' : index < step ? 'bg-success-100 text-success-700' : 'bg-neutral-100 text-neutral-400'}`}>{index < step ? <Check className="w-4 h-4" /> : index + 1}<span className="hidden md:inline">{label}</span></div>{index < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-neutral-300" />}</div>)}
      </div>
      <Card className="p-6 max-w-4xl">
        {step === 0 && <section><h2 className="font-semibold mb-4">1. เลือกรายวิชา</h2><div className="space-y-2">{courses.map(course => <button key={course.id} onClick={() => setCourseId(course.id)} className={`w-full text-left p-4 rounded-lg border ${courseId === course.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200'}`}><p className="font-mono text-sm text-primary-600">{course.course_code}</p><p className="font-medium">{course.course_name_th}</p></button>)}</div></section>}
        {step === 1 && <section><h2 className="font-semibold mb-1">2. เลือกแหล่งความรู้</h2><p className="text-sm text-neutral-500 mb-4">เอกสารที่ AI ต้องใช้อ้างอิงและสร้างหลักฐาน</p><div className="space-y-2">{docs.map(document => <button key={document.id} onClick={() => toggle(docIds, document.id, setDocIds)} className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left ${docIds.includes(document.id) ? 'border-primary-500 bg-primary-50' : 'border-neutral-200'}`}><FileText className="w-5 h-5 text-neutral-400" /><span className="flex-1">{document.file_name}</span>{docIds.includes(document.id) && <Check className="w-5 h-5 text-primary-600" />}</button>)}</div>{!docs.length && <p className="text-sm text-warning-700">รายวิชานี้ยังไม่มีเอกสาร</p>}</section>}
        {step === 2 && <section><h2 className="font-semibold mb-1">3. เลือก Learning Outcomes</h2><p className="text-sm text-neutral-500 mb-4">ทุกคำถามจะถูกผูกกับผลลัพธ์การเรียนรู้ที่เลือก</p><div className="space-y-2">{outcomes.map(outcome => <button key={outcome.id} onClick={() => toggle(loIds, outcome.id, setLoIds)} className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left ${loIds.includes(outcome.id) ? 'border-primary-500 bg-primary-50' : 'border-neutral-200'}`}><Target className="w-5 h-5 text-neutral-400" /><span className="flex-1"><strong>{outcome.code}</strong> {outcome.title}</span>{loIds.includes(outcome.id) && <Check className="w-5 h-5 text-primary-600" />}</button>)}</div></section>}
        {step === 3 && <section><h2 className="font-semibold mb-4">4. เลือกโหมดการสร้าง</h2><div className="grid md:grid-cols-3 gap-4">{MODES.map(item => <button key={item.id} onClick={() => setMode(item.id)} className={`text-left p-5 rounded-xl border ${mode === item.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}><item.icon className="w-7 h-7 text-primary-600 mb-3" /><p className="font-semibold">{item.title}</p><p className="text-sm text-neutral-500 mt-1">{item.description}</p></button>)}</div>{mode === 'manual' && <div className="mt-5 p-4 rounded-lg bg-neutral-50 border border-neutral-200"><p className="text-sm mb-3">โหมด Manual ใช้ตัวสร้างคำถามโดยผู้สอนโดยเฉพาะ</p><button onClick={() => navigate(`/questions/new?courseId=${encodeURIComponent(courseId)}`)} className="btn-primary">ไปหน้าสร้างข้อสอบด้วยตนเอง</button></div>}</section>}
        {step === 4 && (
          <section className="space-y-4">
            <h2 className="font-semibold">5. ตั้งค่าการสร้าง</h2>
            {(!questionTypes.length || !difficulties.length) && (
              <div className="p-4 rounded-lg bg-error-50 border border-error-200 text-sm text-error-700 flex gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  {!questionTypes.length && !difficulties.length
                    ? 'ไม่พบประเภทคำถามและระดับความยากจากระบบ'
                    : !questionTypes.length
                      ? 'ไม่พบประเภทคำถามจากระบบ'
                      : 'ไม่พบระดับความยากจากระบบ'}
                  {error ? ` — ${error}` : ''}
                </span>
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">ประเภทคำถาม</label>
                <select className="input" value={questionType} onChange={event => setQuestionType(event.target.value as QuestionType)} disabled={!questionTypes.length}>
                  {questionTypes.filter(type => type.supports_ai_generation).map(type => <option key={type.id} value={type.code}>{type.name_th}</option>)}
                </select>
              </div>
              <div>
                <label className="label">ระดับความยาก</label>
                <select className="input" value={difficulty} onChange={event => setDifficulty(event.target.value as DifficultyLevel)} disabled={!difficulties.length}>
                  {difficulties.map(item => <option key={item.id} value={item.code}>{item.name_th}</option>)}
                </select>
              </div>
              <div><label className="label">Bloom</label><select className="input" value={bloom} onChange={event => setBloom(event.target.value as BloomLevel)}>{Object.entries(BLOOM_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>
              <div><label className="label">ภาษา</label><select className="input" value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="th">ไทย</option><option value="en">English</option></select></div>
              <div><label className="label">จำนวนข้อ</label><input className="input" type="number" min={1} max={30} value={numberOfQuestions} onChange={event => setNumberOfQuestions(Number(event.target.value))} /></div>
              <div><label className="label">คะแนนต่อข้อ</label><input className="input" type="number" min={1} value={marks} onChange={event => setMarks(Number(event.target.value))} /></div>
              <div><label className="label">AI Provider</label><select className="input" value={providerId} onChange={event => setProviderId(event.target.value)}>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}{provider.is_enabled ? '' : ' (ยังไม่เปิดใช้)'}</option>)}</select></div>
              <div><label className="label">Rule Set</label><select className="input" value={ruleSetId} onChange={event => setRuleSetId(event.target.value)}>{ruleSets.map(ruleSet => <option key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}</option>)}</select></div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={knowledgeBounded} onChange={event => setKnowledgeBounded(event.target.checked)} /> จำกัดคำตอบด้วยหลักฐานจากเอกสาร (Knowledge Bounded)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeExplanation} onChange={event => setIncludeExplanation(event.target.checked)} /> รวมคำอธิบาย</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeRubric} onChange={event => setIncludeRubric(event.target.checked)} /> รวม Rubric</label>
            </div>
          </section>
        )}
        {step === 5 && <section><h2 className="font-semibold mb-1">6. กฎที่ใช้</h2><p className="text-sm text-neutral-500 mb-4">เรียงตามขอบเขตและลำดับความสำคัญ</p><div className="space-y-2">{rules.map(rule => <div key={rule.id} className="p-3 border border-neutral-200 rounded-lg flex flex-wrap items-center gap-2"><div className="flex-1 min-w-48"><p className="font-medium text-sm">{rule.name}</p><p className="text-xs text-neutral-500">{rule.code} · Priority {rule.priority}</p></div><Badge variant="neutral">{rule.scope}</Badge><Badge variant={rule.severity === 'critical' || rule.severity === 'error' ? 'error' : rule.severity === 'warning' ? 'warning' : 'primary'}>{rule.severity}</Badge>{rule.is_blocking && <Badge variant="error">Blocking</Badge>}</div>)}</div></section>}
        {step === 6 && <section><h2 className="font-semibold mb-4">7. ตรวจสอบแผน</h2><div className="divide-y divide-neutral-100 text-sm">{[['รายวิชา', courses.find(course => course.id === courseId)?.course_code || '-'], ['โหมด', mode], ['เอกสาร', `${docIds.length} ไฟล์`], ['Learning Outcomes', `${loIds.length} รายการ`], ['ประเภท', questionTypes.find(type => type.code === questionType)?.name_th || questionType], ['Bloom', BLOOM_LABELS[bloom]], ['ความยาก', difficulties.find(item => item.code === difficulty)?.name_th || difficulty], ['จำนวนและคะแนน', `${numberOfQuestions} ข้อ × ${marks} คะแนน`], ['Provider', providers.find(provider => provider.id === providerId)?.name || '-'], ['Rule Set', ruleSets.find(ruleSet => ruleSet.id === ruleSetId)?.name || '-'], ['Knowledge Bounded', knowledgeBounded ? 'เปิด' : 'ปิด']].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><span className="text-neutral-500">{label}</span><span className="font-medium text-right">{value}</span></div>)}</div></section>}
        {step === 7 && (
          <section>
            <h2 className="font-semibold mb-4">8. สร้างและตรวจสอบ</h2>
            {generating ? (
              <div className="py-10 text-center">
                <Sparkles className="w-10 h-10 text-primary-500 mx-auto animate-pulse" />
                <p className="text-sm text-neutral-500 mt-4 mb-1">กำลังดำเนินการผ่าน Orchestrator...</p>
                <p className="text-xs text-neutral-400 mb-3">{progressStage || 'เริ่มต้น'} · {progressPct}%</p>
                <ProgressBar value={progressPct} />
              </div>
            ) : result?.success ? (
              <div>
                <div className="flex gap-2 items-center text-success-700 mb-4"><Check className="w-5 h-5" /><strong>สร้างสำเร็จ {result.savedQuestions?.length || result.questions.length} ข้อ</strong></div>
                {result.usage && <p className="text-xs text-neutral-500 mb-4">Model: {result.usage.model} · Tokens: {result.usage.totalTokens.toLocaleString()}</p>}
                <h3 className="font-medium mb-2">ผล Verification</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(result.verification || []).map((verification, index) => (
                    <div key={index} className="border border-neutral-200 rounded-lg p-3">
                      <div className="flex justify-between"><span className="text-sm font-medium">ข้อ {index + 1}</span><Badge variant={verification.status === 'pass' ? 'success' : verification.status === 'warning' ? 'warning' : 'error'}>{verification.status} · {verification.score}</Badge></div>
                      {verification.violations.length > 0 && <p className="text-xs text-error-600 mt-2">{verification.violations.join(' · ')}</p>}
                      {verification.recommendations.length > 0 && <p className="text-xs text-neutral-500 mt-1">{verification.recommendations.join(' · ')}</p>}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-5">
                  <button className="btn-primary" onClick={() => navigate('/question-bank')}>ไปคลังข้อสอบ</button>
                  <button className="btn-secondary" onClick={() => navigate('/review')}>ไปคิวตรวจ</button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center">
                <Sparkles className="w-12 h-12 text-primary-300 mx-auto mb-4" />
                <p className="text-sm text-neutral-500 mb-4">พร้อมสร้าง {numberOfQuestions} ข้อในโหมด {mode}</p>
                {error && <div className="mb-4 text-sm text-error-700 flex justify-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}
                <button onClick={generate} className="btn-primary">เริ่มสร้างข้อสอบ</button>
              </div>
            )}
          </section>
        )}
        {step < STEPS.length - 1 && <div className="flex justify-between mt-6 pt-4 border-t border-neutral-100"><button disabled={step === 0} onClick={() => setStep(current => Math.max(0, current - 1))} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> ย้อนกลับ</button><button disabled={!canContinue()} onClick={() => setStep(current => current + 1)} className="btn-primary">ถัดไป <ChevronRight className="w-4 h-4" /></button></div>}
      </Card>
    </div>
  );
}

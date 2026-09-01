import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Card, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { DemoAIProvider } from '../lib/ai-provider';
import { fetchCourseDocuments } from '../lib/documents';
import { insertQuestions, listCourses, listLearningOutcomes } from '../lib/api';
import { aiOrchestrator } from '../services';
import { BLOOM_LABELS } from '../types';
import type { BloomLevel, Course, DifficultyLevel, Document, Language, LearningOutcome, QuestionChoice, QuestionType } from '../types';
import type { DifficultyDefinition, QuestionTypeDef } from '../types/v2';

const BLOOMS = Object.entries(BLOOM_LABELS) as [BloomLevel, string][];

export default function ManualQuestionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeDef[]>([]);
  const [difficulties, setDifficulties] = useState<DifficultyDefinition[]>([]);
  const [outcomes, setOutcomes] = useState<LearningOutcome[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [courseId, setCourseId] = useState(searchParams.get('courseId') || '');
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice_single');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [bloom, setBloom] = useState<BloomLevel | ''>('');
  const [language, setLanguage] = useState<Language>('th');
  const [marks, setMarks] = useState(1);
  const [topic, setTopic] = useState('');
  const [loIds, setLoIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [questionText, setQuestionText] = useState('');
  const [choices, setChoices] = useState<QuestionChoice[]>([
    { id: 'a', text: '', is_correct: true, rationale: '' },
    { id: 'b', text: '', is_correct: false, rationale: '' },
    { id: 'c', text: '', is_correct: false, rationale: '' },
    { id: 'd', text: '', is_correct: false, rationale: '' },
  ]);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [rubricText, setRubricText] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [draft, setDraft] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [busy, setBusy] = useState(true);
  const [assisting, setAssisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedType = useMemo(() => questionTypes.find(type => type.code === questionType), [questionType, questionTypes]);
  const requiresChoices = selectedType?.requires_choices ?? questionType.startsWith('multiple_choice');

  useEffect(() => {
    Promise.all([listCourses(), aiOrchestrator.listQuestionTypes(), aiOrchestrator.listDifficulties()])
      .then(([courseRows, typeRows, difficultyRows]) => {
        setCourses(courseRows);
        setQuestionTypes(typeRows);
        setDifficulties(difficultyRows);
      })
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    setLoIds([]);
    setDocumentIds([]);
    if (!courseId) {
      setOutcomes([]);
      setDocuments([]);
      return;
    }
    Promise.all([listLearningOutcomes(courseId), fetchCourseDocuments(courseId)])
      .then(([outcomeRows, documentRows]) => {
        setOutcomes(outcomeRows);
        setDocuments(documentRows);
      });
  }, [courseId]);

  const toggle = (items: string[], id: string, setter: (value: string[]) => void) => {
    setter(items.includes(id) ? items.filter(item => item !== id) : [...items, id]);
  };

  const updateChoice = (id: string, patch: Partial<QuestionChoice>) => {
    setChoices(current => current.map(choice => choice.id === id ? { ...choice, ...patch } : choice));
  };

  const markCorrect = (id: string) => {
    setChoices(current => current.map(choice => ({
      ...choice,
      is_correct: questionType === 'multiple_choice_multiple'
        ? (choice.id === id ? !choice.is_correct : choice.is_correct)
        : choice.id === id,
    })));
  };

  const runAssist = async (action: 'wording' | 'distractors' | 'bloom') => {
    if (!courseId) return setError('กรุณาเลือกรายวิชาก่อนใช้ AI ช่วย');
    setAssisting(true);
    setError('');
    try {
      const result = await new DemoAIProvider().generateQuestions({
        courseId,
        documentIds,
        learningOutcomeIds: loIds,
        questionType: requiresChoices ? 'multiple_choice_single' : questionType,
        bloomLevel: bloom || 'understand',
        difficulty,
        numberOfQuestions: 1,
        language,
        marksPerQuestion: marks,
        includeExplanation: true,
        includeRubric: false,
      });
      const suggestion = result.questions[0];
      if (action === 'wording') {
        setAiNote(`ข้อเสนอแนะการปรับถ้อยคำ (ยังไม่ได้แทนที่ข้อความเดิม):\n${suggestion.questionText}`);
      } else if (action === 'bloom') {
        if (!bloom) setBloom(suggestion.bloomLevel);
        setAiNote(`AI แนะนำ Bloom: ${BLOOM_LABELS[suggestion.bloomLevel]}`);
      } else {
        const distractors = (suggestion.choices || []).filter(choice => !choice.is_correct);
        let index = 0;
        setChoices(current => current.map(choice => {
          if (choice.text.trim() || choice.is_correct || !distractors[index]) return choice;
          return { ...choice, text: distractors[index++].text };
        }));
        setAiNote('เติมเฉพาะตัวเลือกที่ยังว่างแล้ว กรุณาตรวจสอบก่อนบันทึก');
      }
    } finally {
      setAssisting(false);
    }
  };

  const save = async () => {
    if (!courseId || !questionText.trim() || !bloom) {
      setError('กรุณาระบุรายวิชา คำถาม และ Bloom ให้ครบ');
      return;
    }
    if (requiresChoices && (!choices.some(choice => choice.is_correct) || choices.some(choice => !choice.text.trim()))) {
      setError('กรุณากรอกตัวเลือกทั้งหมดและทำเครื่องหมายคำตอบที่ถูก');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const selectedOutcomes = outcomes.filter(outcome => loIds.includes(outcome.id));
      const selectedDocuments = documents.filter(document => documentIds.includes(document.id));
      const rubric = rubricText.trim() ? {
        total_marks: marks,
        criteria: [{
          criterion: 'เกณฑ์การให้คะแนน',
          description: rubricText.trim(),
          max_marks: marks,
          performance_levels: [],
        }],
      } : null;
      const answer = requiresChoices
        ? choices.filter(choice => choice.is_correct).map(choice => choice.id)
        : correctAnswer.trim();
      const rows = await insertQuestions([{
        course_id: courseId,
        question_type: questionType,
        question_text: questionText.trim(),
        language,
        topic: topic.trim() || null,
        choices: requiresChoices ? choices : null,
        correct_answer: questionType === 'multiple_choice_multiple' ? answer : Array.isArray(answer) ? answer[0] || '' : answer,
        explanation: explanation.trim(),
        intended_bloom_level: bloom,
        intended_difficulty: difficulty,
        marks,
        estimated_answer_time_minutes: difficulty === 'easy' ? 1 : difficulty === 'hard' ? 5 : 2,
        source_references: selectedDocuments.map(document => ({
          document_id: document.id,
          file_name: document.file_name,
          page: 0,
          section: '',
          quote: null,
        })),
        rubric,
        learning_outcome_codes: selectedOutcomes.map(outcome => outcome.code),
        quality_flags: [],
        status: draft ? 'draft' : 'ready_for_review',
        source_type: 'human_written',
        created_by: user?.id || 'unknown',
        generated_by_ai: false,
        generation_mode: 'manual',
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        notes: notes.trim() || null,
      }]);
      navigate(rows[0]?.id ? `/questions/${rows[0].id}` : '/question-bank');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ไม่สามารถบันทึกคำถามได้');
    } finally {
      setSaving(false);
    }
  };

  if (busy) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div>
      <PageHeader title="สร้างข้อสอบด้วยตนเอง" description="สร้างและบันทึกคำถามโดยผู้สอน พร้อม AI ช่วยเฉพาะจุดตามที่สั่ง" />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <Card className="p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="label">รายวิชา *</label><select className="input" value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">เลือกรายวิชา</option>{courses.map(course => <option key={course.id} value={course.id}>{course.course_code} — {course.course_name_th}</option>)}</select></div>
            <div><label className="label">ประเภทคำถาม</label><select className="input" value={questionType} onChange={event => setQuestionType(event.target.value as QuestionType)}>{questionTypes.map(type => <option key={type.id} value={type.code}>{type.name_th}</option>)}</select></div>
            <div><label className="label">ระดับความยาก</label><select className="input" value={difficulty} onChange={event => setDifficulty(event.target.value as DifficultyLevel)}>{difficulties.map(item => <option key={item.id} value={item.code}>{item.name_th}</option>)}</select></div>
            <div><label className="label">Bloom</label><select className="input" value={bloom} onChange={event => setBloom(event.target.value as BloomLevel)}><option value="">ยังไม่ระบุ</option>{BLOOMS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>
            <div><label className="label">ภาษา</label><select className="input" value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="th">ไทย</option><option value="en">English</option></select></div>
            <div><label className="label">คะแนน</label><input className="input" type="number" min={0.5} step={0.5} value={marks} onChange={event => setMarks(Number(event.target.value))} /></div>
          </div>
          <div><label className="label">หัวข้อ</label><input className="input" value={topic} onChange={event => setTopic(event.target.value)} /></div>
          <div><label className="label">Learning Outcomes</label><div className="grid sm:grid-cols-2 gap-2">{outcomes.map(outcome => <label key={outcome.id} className="flex gap-2 rounded-lg border border-neutral-200 p-3 text-sm"><input type="checkbox" checked={loIds.includes(outcome.id)} onChange={() => toggle(loIds, outcome.id, setLoIds)} /><span><strong>{outcome.code}</strong> {outcome.title}</span></label>)}</div></div>
          <div><label className="label">คำถาม *</label><textarea className="input min-h-28" value={questionText} onChange={event => setQuestionText(event.target.value)} /></div>
          {requiresChoices && <div className="space-y-2"><div className="flex items-center justify-between"><label className="label mb-0">ตัวเลือก</label><button type="button" className="btn-secondary" onClick={() => setChoices(current => [...current, { id: String.fromCharCode(97 + current.length), text: '', is_correct: false, rationale: '' }])}><Plus className="w-4 h-4" /> เพิ่ม</button></div>{choices.map((choice, index) => <div key={choice.id} className="flex gap-2 items-center"><button type="button" title="ทำเครื่องหมายคำตอบถูก" onClick={() => markCorrect(choice.id)} className={`w-9 h-9 rounded-full border flex-shrink-0 ${choice.is_correct ? 'bg-success-100 border-success-500 text-success-700' : 'border-neutral-300'}`}>{choice.is_correct ? <Check className="w-4 h-4 mx-auto" /> : String.fromCharCode(65 + index)}</button><input className="input" value={choice.text} onChange={event => updateChoice(choice.id, { text: event.target.value })} placeholder={`ตัวเลือก ${index + 1}`} /><button type="button" disabled={choices.length <= 2} onClick={() => setChoices(current => current.filter(item => item.id !== choice.id))} className="p-2 text-error-500 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button></div>)}</div>}
          {!requiresChoices && <div><label className="label">คำตอบที่ถูกต้อง</label><textarea className="input min-h-20" value={correctAnswer} onChange={event => setCorrectAnswer(event.target.value)} /></div>}
          <div><label className="label">คำอธิบาย / เฉลย</label><textarea className="input min-h-20" value={explanation} onChange={event => setExplanation(event.target.value)} /></div>
          <div><label className="label">Rubric (ไม่บังคับ)</label><textarea className="input min-h-20" value={rubricText} onChange={event => setRubricText(event.target.value)} /></div>
          <div><label className="label">เอกสารอ้างอิง</label><div className="grid sm:grid-cols-2 gap-2">{documents.map(document => <label key={document.id} className="flex gap-2 rounded-lg border border-neutral-200 p-3 text-sm"><input type="checkbox" checked={documentIds.includes(document.id)} onChange={() => toggle(documentIds, document.id, setDocumentIds)} /><span className="truncate">{document.file_name}</span></label>)}</div></div>
          <div className="grid md:grid-cols-2 gap-4"><div><label className="label">แท็ก (คั่นด้วยจุลภาค)</label><input className="input" value={tags} onChange={event => setTags(event.target.value)} /></div><div><label className="label">บันทึกภายใน</label><input className="input" value={notes} onChange={event => setNotes(event.target.value)} /></div></div>
          {error && <p className="text-sm text-error-600">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-100"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft} onChange={event => setDraft(event.target.checked)} /> บันทึกเป็นฉบับร่าง</label><div className="flex gap-2"><button className="btn-secondary" onClick={() => navigate('/question-bank')}>ยกเลิก</button><button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'กำลังบันทึก...' : 'บันทึกคำถาม'}</button></div></div>
        </Card>
        <Card className="p-5 h-fit xl:sticky xl:top-20">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="w-5 h-5 text-primary-600" /><h2 className="font-semibold">AI ช่วยเฉพาะจุด</h2></div>
          <p className="text-xs text-neutral-500 mb-4">AI จะไม่แทนที่ข้อมูลทั้งฟอร์มโดยอัตโนมัติ</p>
          <div className="space-y-2"><button disabled={assisting} onClick={() => runAssist('wording')} className="btn-secondary w-full justify-start">Improve wording</button><button disabled={assisting || !requiresChoices} onClick={() => runAssist('distractors')} className="btn-secondary w-full justify-start">Generate distractors</button><button disabled={assisting} onClick={() => runAssist('bloom')} className="btn-secondary w-full justify-start">Suggest Bloom</button></div>
          {aiNote && <div className="mt-4 p-3 rounded-lg bg-primary-50 text-sm text-primary-800 whitespace-pre-wrap">{aiNote}</div>}
        </Card>
      </div>
    </div>
  );
}

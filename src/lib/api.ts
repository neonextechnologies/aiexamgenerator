import { supabase, isDemoMode } from './supabase';
import { demoStore } from './demo-data';
import { contentHashForQuestion } from '../services/duplicates';
import type {
  Course,
  CourseTag,
  CourseTopic,
  LearningOutcome,
  TestBlueprint,
  Question,
  QuestionEditHistory,
  Exam,
  ExamQuestion,
  ExamVersion,
  GenerationJob,
  QuestionReview,
  Notification,
  AIUsageLog,
  AuditLog,
  BloomLevel,
  DifficultyLevel,
  QuestionStatus,
  ExamType,
  Language,
  BlueprintRow,
} from '../types';

function requireClient() {
  if (!supabase) throw new Error('Supabase client is not configured');
  return supabase;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function writeAudit(log: AuditLog): Promise<void> {
  if (isDemoMode || !supabase) {
    demoStore.auditLogs.unshift(log);
    return;
  }
  await requireClient().from('audit_logs').insert(log);
}

// ─── Courses ───────────────────────────────────────────────────────────────

export async function listCourses(): Promise<Course[]> {
  if (isDemoMode || !supabase) return [...demoStore.courses];
  const { data, error } = await requireClient().from('courses').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Course[];
}

export async function getCourse(courseId: string): Promise<Course | null> {
  if (isDemoMode || !supabase) return demoStore.courses.find(c => c.id === courseId) ?? null;
  const { data, error } = await requireClient().from('courses').select('*').eq('id', courseId).maybeSingle();
  if (error) throw error;
  return data as Course | null;
}

export async function createCourse(payload: Omit<Course, 'created_at'> & { created_at?: string }): Promise<Course> {
  if (isDemoMode || !supabase) {
    const course = { ...payload, created_at: payload.created_at || new Date().toISOString() } as Course;
    demoStore.courses.push(course);
    return course;
  }
  const { data, error } = await requireClient().from('courses').insert(payload).select().single();
  if (error) throw error;
  return data as Course;
}

export async function createCourseFromForm(input: {
  course_code: string;
  course_name_th: string;
  course_name_en?: string;
  description?: string;
  credits?: number;
  level?: string;
  faculty?: string;
  department?: string;
  semester: string;
  academic_year: string;
  instructor_id: string;
  language?: Language;
}): Promise<Course> {
  const course: Course = {
    id: newId('c'),
    course_code: input.course_code.trim(),
    course_name_th: input.course_name_th.trim(),
    course_name_en: input.course_name_en?.trim() || null,
    description: input.description?.trim() || null,
    credits: input.credits ?? 3,
    level: input.level || null,
    faculty: input.faculty || null,
    department: input.department || null,
    semester: input.semester,
    academic_year: input.academic_year,
    instructor_id: input.instructor_id,
    language: input.language || 'th',
    status: 'active',
    visibility: 'private',
    created_at: new Date().toISOString(),
  };
  const saved = await createCourse(course);
  await writeAudit({
    id: newId('audit'),
    user_id: input.instructor_id,
    user_name: '',
    action: 'create_course',
    entity_type: 'course',
    entity_id: saved.id,
    details: saved.course_code,
    created_at: new Date().toISOString(),
  });
  return saved;
}

export async function updateCourse(
  courseId: string,
  patch: Partial<Pick<Course,
    | 'course_name_th'
    | 'course_name_en'
    | 'description'
    | 'credits'
    | 'faculty'
    | 'level'
    | 'semester'
    | 'academic_year'
    | 'department'
    | 'status'
    | 'visibility'
    | 'language'
  >>,
): Promise<Course> {
  if (isDemoMode || !supabase) {
    const idx = demoStore.courses.findIndex(c => c.id === courseId);
    if (idx < 0) throw new Error('ไม่พบรายวิชา');
    demoStore.courses[idx] = { ...demoStore.courses[idx], ...patch };
    return demoStore.courses[idx];
  }
  const { data, error } = await requireClient().from('courses').update(patch).eq('id', courseId).select().single();
  if (error) throw error;
  return data as Course;
}

// ─── Learning outcomes ─────────────────────────────────────────────────────

export async function listLearningOutcomes(courseId?: string): Promise<LearningOutcome[]> {
  if (isDemoMode || !supabase) {
    return courseId
      ? demoStore.learningOutcomes.filter(lo => lo.course_id === courseId)
      : [...demoStore.learningOutcomes];
  }
  let q = requireClient().from('learning_outcomes').select('*').order('created_at', { ascending: true });
  if (courseId) q = q.eq('course_id', courseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as LearningOutcome[];
}

export async function createLearningOutcome(input: {
  course_id: string;
  code: string;
  title: string;
  description?: string;
  outcome_type?: LearningOutcome['outcome_type'];
  bloom_level?: BloomLevel | null;
  weight?: number | null;
  assessment_method?: string | null;
}): Promise<LearningOutcome> {
  const row: LearningOutcome = {
    id: newId('lo'),
    course_id: input.course_id,
    code: input.code.trim(),
    title: input.title.trim(),
    description: input.description?.trim() || '',
    outcome_type: input.outcome_type || 'CLO',
    bloom_level: input.bloom_level || 'understand',
    weight: input.weight ?? null,
    assessment_method: input.assessment_method || null,
    status: 'active',
    created_at: new Date().toISOString(),
  };
  if (isDemoMode || !supabase) {
    demoStore.learningOutcomes.push(row);
    return row;
  }
  const { data, error } = await requireClient().from('learning_outcomes').insert(row).select().single();
  if (error) throw error;
  return data as LearningOutcome;
}

// ─── Topics / tags ─────────────────────────────────────────────────────────

export async function listCourseTopics(courseId?: string): Promise<CourseTopic[]> {
  if (isDemoMode || !supabase) {
    return courseId ? demoStore.topics.filter(t => t.course_id === courseId) : [...demoStore.topics];
  }
  let q = requireClient().from('course_topics').select('*').order('sort_order', { ascending: true });
  if (courseId) q = q.eq('course_id', courseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as CourseTopic[];
}

export async function createCourseTopic(input: {
  course_id: string;
  title: string;
  description?: string;
  week_number?: number | null;
}): Promise<CourseTopic> {
  const existing = await listCourseTopics(input.course_id);
  const row: CourseTopic = {
    id: newId('t'),
    course_id: input.course_id,
    title: input.title.trim(),
    description: input.description || null,
    week_number: input.week_number ?? null,
    sort_order: existing.length + 1,
  };
  if (isDemoMode || !supabase) {
    demoStore.topics.push(row);
    return row;
  }
  const { data, error } = await requireClient().from('course_topics').insert(row).select().single();
  if (error) throw error;
  return data as CourseTopic;
}

export async function listCourseTags(courseId?: string): Promise<CourseTag[]> {
  if (isDemoMode || !supabase) {
    return courseId ? demoStore.tags.filter(t => t.course_id === courseId) : [...demoStore.tags];
  }
  let q = requireClient().from('course_tags').select('*').order('name', { ascending: true });
  if (courseId) q = q.eq('course_id', courseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as CourseTag[];
}

export async function createCourseTag(input: { course_id: string; name: string; color?: string }): Promise<CourseTag> {
  const row: CourseTag = {
    id: newId('tag'),
    course_id: input.course_id,
    name: input.name.trim(),
    color: input.color || null,
    created_at: new Date().toISOString(),
  };
  if (isDemoMode || !supabase) {
    const exists = demoStore.tags.find(t => t.course_id === row.course_id && t.name === row.name);
    if (exists) return exists;
    demoStore.tags.push(row);
    return row;
  }
  const { data, error } = await requireClient().from('course_tags').insert(row).select().single();
  if (error) throw error;
  return data as CourseTag;
}

// ─── Blueprints ────────────────────────────────────────────────────────────

export async function listBlueprints(courseId?: string): Promise<TestBlueprint[]> {
  if (isDemoMode || !supabase) {
    return courseId
      ? demoStore.blueprints.filter(b => b.course_id === courseId)
      : [...demoStore.blueprints];
  }
  let q = requireClient().from('test_blueprints').select('*').order('created_at', { ascending: false });
  if (courseId) q = q.eq('course_id', courseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as TestBlueprint[];
}

export async function createBlueprint(input: {
  course_id: string;
  name: string;
  exam_type?: ExamType;
  duration_minutes?: number;
  language?: Language;
  instructions?: string;
  rows: Array<Partial<BlueprintRow> & { topic: string; clo_code: string; num_questions: number; marks_per_question: number }>;
}): Promise<TestBlueprint> {
  const rows: BlueprintRow[] = input.rows.map((r) => ({
    id: r.id || newId('br'),
    topic: r.topic,
    clo_code: r.clo_code,
    bloom: (r.bloom || 'understand') as BloomLevel,
    difficulty: (r.difficulty || 'medium') as DifficultyLevel,
    question_type: (r.question_type || 'multiple_choice_single') as BlueprintRow['question_type'],
    num_questions: r.num_questions,
    marks_per_question: r.marks_per_question,
  }));
  const totalQuestions = rows.reduce((s, r) => s + r.num_questions, 0);
  const totalMarks = rows.reduce((s, r) => s + r.num_questions * r.marks_per_question, 0);
  const bp: TestBlueprint = {
    id: newId('bp'),
    course_id: input.course_id,
    name: input.name.trim(),
    exam_type: input.exam_type || 'midterm',
    total_questions: totalQuestions,
    total_marks: totalMarks,
    duration_minutes: input.duration_minutes || 60,
    language: input.language || 'th',
    instructions: input.instructions || null,
    rows,
    status: 'active',
    created_at: new Date().toISOString(),
  };
  if (isDemoMode || !supabase) {
    demoStore.blueprints.push(bp);
    return bp;
  }
  const { data, error } = await requireClient().from('test_blueprints').insert(bp).select().single();
  if (error) throw error;
  return data as TestBlueprint;
}

// ─── Questions ─────────────────────────────────────────────────────────────

export async function listQuestions(filters?: {
  courseId?: string;
  statuses?: QuestionStatus[];
}): Promise<Question[]> {
  if (isDemoMode || !supabase) {
    let qs = [...demoStore.questions];
    if (filters?.courseId) qs = qs.filter(q => q.course_id === filters.courseId);
    if (filters?.statuses?.length) qs = qs.filter(q => filters.statuses!.includes(q.status));
    return qs;
  }
  let q = requireClient().from('questions').select('*').order('created_at', { ascending: false });
  if (filters?.courseId) q = q.eq('course_id', filters.courseId);
  if (filters?.statuses?.length) q = q.in('status', filters.statuses);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Question[];
}

export async function getQuestion(questionId: string): Promise<Question | null> {
  if (isDemoMode || !supabase) return demoStore.questions.find(q => q.id === questionId) ?? null;
  const { data, error } = await requireClient().from('questions').select('*').eq('id', questionId).maybeSingle();
  if (error) throw error;
  return data as Question | null;
}

export async function insertQuestions(rows: Partial<Question>[]): Promise<Question[]> {
  if (isDemoMode || !supabase) {
    const mapped = rows.map((r, i) => {
      const text = r.question_text || '';
      return {
        id: r.id || `q-gen-${Date.now()}-${i}`,
        course_id: r.course_id || '',
        question_type: r.question_type || 'multiple_choice_single',
        question_text: text,
        language: r.language || 'th',
        topic: r.topic ?? null,
        tags: r.tags || [],
        choices: r.choices ?? null,
        correct_answer: r.correct_answer ?? '',
        explanation: r.explanation || '',
        intended_bloom_level: r.intended_bloom_level || 'understand',
        ai_predicted_bloom_level: r.ai_predicted_bloom_level ?? null,
        reviewer_confirmed_bloom_level: null,
        intended_difficulty: r.intended_difficulty || 'medium',
        ai_predicted_difficulty: r.ai_predicted_difficulty ?? null,
        reviewer_confirmed_difficulty: null,
        marks: r.marks ?? 1,
        estimated_answer_time_minutes: r.estimated_answer_time_minutes ?? 2,
        source_references: r.source_references ?? null,
        rubric: r.rubric ?? null,
        learning_outcome_codes: r.learning_outcome_codes || [],
        quality_flags: r.quality_flags || [],
        quality_score: r.quality_score ?? null,
        status: r.status || 'ai_generated',
        source_type: r.source_type || 'ai_generated',
        created_by: r.created_by || 'unknown',
        generated_by_ai: r.generated_by_ai ?? true,
        ai_model: r.ai_model ?? null,
        content_hash: r.content_hash || contentHashForQuestion(text),
        near_duplicate_of: r.near_duplicate_of ?? null,
        near_duplicate_score: r.near_duplicate_score ?? null,
        duplicate_matches: r.duplicate_matches ?? null,
        generation_mode: r.generation_mode ?? null,
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || new Date().toISOString(),
        used_count: r.used_count ?? 0,
        exposure_level: r.exposure_level || 'new',
      };
    }) as Question[];
    demoStore.questions.push(...mapped);
    return mapped;
  }
  const withHash = rows.map(r => ({
    ...r,
    content_hash: r.content_hash || contentHashForQuestion(r.question_text || ''),
    tags: r.tags || [],
  }));
  const { data, error } = await requireClient().from('questions').insert(withHash).select();
  if (error) throw error;
  return (data || []) as Question[];
}

export async function updateQuestion(questionId: string, patch: Partial<Question>): Promise<Question> {
  const nextPatch = { ...patch };
  if (typeof patch.question_text === 'string') {
    nextPatch.content_hash = contentHashForQuestion(patch.question_text);
  }
  if (isDemoMode || !supabase) {
    const q = demoStore.questions.find(x => x.id === questionId);
    if (!q) throw new Error('Question not found');
    Object.assign(q, nextPatch, { updated_at: new Date().toISOString() });
    return q;
  }
  const { data, error } = await requireClient()
    .from('questions')
    .update({ ...nextPatch, updated_at: new Date().toISOString() })
    .eq('id', questionId)
    .select()
    .single();
  if (error) throw error;
  return data as Question;
}

export async function listQuestionEditHistory(questionId: string): Promise<QuestionEditHistory[]> {
  if (isDemoMode || !supabase) {
    return demoStore.editHistory.filter(h => h.question_id === questionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  const { data, error } = await requireClient()
    .from('question_edit_history')
    .select('*')
    .eq('question_id', questionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as QuestionEditHistory[];
}

export async function saveQuestionEdit(input: {
  questionId: string;
  patch: Partial<Question>;
  editedBy: string;
  editorName: string;
  changeSummary: string;
  source?: QuestionEditHistory['source'];
}): Promise<Question> {
  const before = await getQuestion(input.questionId);
  if (!before) throw new Error('Question not found');
  const after = await updateQuestion(input.questionId, input.patch);
  const history: QuestionEditHistory = {
    id: newId('qeh'),
    question_id: input.questionId,
    edited_by: input.editedBy,
    editor_name: input.editorName,
    change_summary: input.changeSummary,
    before_json: {
      question_text: before.question_text,
      choices: before.choices,
      correct_answer: before.correct_answer,
      explanation: before.explanation,
      rubric: before.rubric,
      topic: before.topic,
      tags: before.tags,
    },
    after_json: {
      question_text: after.question_text,
      choices: after.choices,
      correct_answer: after.correct_answer,
      explanation: after.explanation,
      rubric: after.rubric,
      topic: after.topic,
      tags: after.tags,
    },
    source: input.source || 'editor',
    created_at: new Date().toISOString(),
  };
  if (isDemoMode || !supabase) {
    demoStore.editHistory.unshift(history);
  } else {
    const { error } = await requireClient().from('question_edit_history').insert(history);
    if (error) throw error;
  }
  await writeAudit({
    id: newId('audit'),
    user_id: input.editedBy,
    user_name: input.editorName,
    action: 'edit_question',
    entity_type: 'question',
    entity_id: input.questionId,
    details: input.changeSummary,
    created_at: new Date().toISOString(),
  });
  return after;
}

export async function duplicateQuestion(questionId: string, userId: string): Promise<Question> {
  const source = await getQuestion(questionId);
  if (!source) throw new Error('Question not found');
  const copy: Partial<Question> = {
    ...source,
    id: newId('q'),
    question_text: `${source.question_text} (สำเนา)`,
    status: 'draft',
    source_type: 'human_written',
    generated_by_ai: false,
    created_by: userId,
    approved_by: null,
    approved_at: null,
    used_count: 0,
    exposure_level: 'new',
    content_hash: contentHashForQuestion(`${source.question_text} (สำเนา)`),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const [saved] = await insertQuestions([copy]);
  await writeAudit({
    id: newId('audit'),
    user_id: userId,
    user_name: '',
    action: 'duplicate_question',
    entity_type: 'question',
    entity_id: saved.id,
    details: `from ${questionId}`,
    created_at: new Date().toISOString(),
  });
  return saved;
}

// ─── Reviews ───────────────────────────────────────────────────────────────

export async function listReviews(questionId?: string): Promise<QuestionReview[]> {
  if (isDemoMode || !supabase) {
    return questionId
      ? demoStore.reviews.filter(r => r.question_id === questionId)
      : [...demoStore.reviews];
  }
  let q = requireClient().from('question_reviews').select('*').order('created_at', { ascending: false });
  if (questionId) q = q.eq('question_id', questionId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as QuestionReview[];
}

export async function submitReview(input: {
  questionId: string;
  reviewerId: string;
  reviewerName: string;
  decision: 'approved' | 'rejected' | 'revision_requested';
  comment: string;
  confirmedBloom?: BloomLevel | null;
  confirmedDifficulty?: DifficultyLevel | null;
}): Promise<QuestionReview> {
  const status: QuestionStatus =
    input.decision === 'approved'
      ? 'approved'
      : input.decision === 'rejected'
        ? 'rejected'
        : 'revision_requested';

  const questionPatch: Partial<Question> = { status };
  if (input.decision === 'approved') {
    questionPatch.approved_by = input.reviewerId;
    questionPatch.approved_at = new Date().toISOString();
    questionPatch.reviewer_confirmed_bloom_level = input.confirmedBloom ?? null;
    questionPatch.reviewer_confirmed_difficulty = input.confirmedDifficulty ?? null;
  }

  await updateQuestion(input.questionId, questionPatch);

  const review: QuestionReview = {
    id: `r-${Date.now()}`,
    question_id: input.questionId,
    reviewer_id: input.reviewerId,
    reviewer_name: input.reviewerName,
    decision: input.decision,
    comment: input.comment,
    confirmed_bloom: input.confirmedBloom ?? null,
    confirmed_difficulty: input.confirmedDifficulty ?? null,
    created_at: new Date().toISOString(),
  };

  if (isDemoMode || !supabase) {
    demoStore.reviews.push(review);
    return review;
  }

  const { data, error } = await requireClient().from('question_reviews').insert(review).select().single();
  if (error) throw error;
  return data as QuestionReview;
}

// ─── Exams ─────────────────────────────────────────────────────────────────

export async function listExams(courseId?: string): Promise<Exam[]> {
  if (isDemoMode || !supabase) {
    return courseId ? demoStore.exams.filter(e => e.course_id === courseId) : [...demoStore.exams];
  }
  let q = requireClient().from('exams').select('*').order('created_at', { ascending: false });
  if (courseId) q = q.eq('course_id', courseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Exam[];
}

export async function getExam(examId: string): Promise<Exam | null> {
  if (isDemoMode || !supabase) return demoStore.exams.find(e => e.id === examId) ?? null;
  const { data, error } = await requireClient().from('exams').select('*').eq('id', examId).maybeSingle();
  if (error) throw error;
  return data as Exam | null;
}

export async function createExam(input: {
  course_id: string;
  name: string;
  exam_type?: ExamType;
  academic_year?: string;
  semester?: string;
  duration_minutes?: number;
  instructions?: string;
  question_ids: string[];
}): Promise<Exam> {
  const questions = await listQuestions({ courseId: input.course_id });
  const selected = input.question_ids
    .map((id, order) => {
      const q = questions.find(item => item.id === id);
      if (!q) return null;
      return { question_id: q.id, order: order + 1, marks: q.marks } as ExamQuestion;
    })
    .filter((q): q is ExamQuestion => !!q);
  const totalMarks = selected.reduce((s, q) => s + q.marks, 0);
  const exam: Exam = {
    id: newId('exam'),
    course_id: input.course_id,
    name: input.name.trim(),
    exam_type: input.exam_type || 'midterm',
    academic_year: input.academic_year || new Date().getFullYear().toString(),
    semester: input.semester || '1',
    exam_date: null,
    duration_minutes: input.duration_minutes || 60,
    total_marks: totalMarks,
    instructions: input.instructions || null,
    questions: selected,
    versions: [{ version_label: 'A', questions: selected, shuffle_questions: false, shuffle_choices: false }],
    status: 'draft',
    created_at: new Date().toISOString(),
  };
  if (isDemoMode || !supabase) {
    demoStore.exams.push(exam);
    return exam;
  }
  const { data, error } = await requireClient().from('exams').insert(exam).select().single();
  if (error) throw error;
  return data as Exam;
}

export async function updateExam(
  examId: string,
  patch: Partial<Pick<Exam,
    | 'name'
    | 'instructions'
    | 'exam_date'
    | 'duration_minutes'
    | 'status'
    | 'versions'
    | 'questions'
    | 'total_marks'
    | 'exam_type'
    | 'academic_year'
    | 'semester'
  >>,
): Promise<Exam> {
  if (isDemoMode || !supabase) {
    const idx = demoStore.exams.findIndex(e => e.id === examId);
    if (idx < 0) throw new Error('ไม่พบชุดข้อสอบ');
    demoStore.exams[idx] = { ...demoStore.exams[idx], ...patch };
    return demoStore.exams[idx];
  }
  const { data, error } = await requireClient().from('exams').update(patch).eq('id', examId).select().single();
  if (error) throw error;
  return data as Exam;
}

function nextExamVersionLabel(versions: ExamVersion[]): string {
  const used = new Set(versions.map(v => v.version_label));
  for (let i = 0; i < 26; i++) {
    const label = String.fromCharCode(65 + i);
    if (!used.has(label)) return label;
  }
  return `V${versions.length + 1}`;
}

function cloneExamQuestions(questions: ExamQuestion[]): ExamQuestion[] {
  return questions.map(q => ({ ...q }));
}

export async function createExamVersion(examId: string): Promise<Exam> {
  const exam = await getExam(examId);
  if (!exam) throw new Error('ไม่พบชุดข้อสอบ');
  const source = exam.versions[exam.versions.length - 1]?.questions || exam.questions;
  const version: ExamVersion = {
    version_label: nextExamVersionLabel(exam.versions),
    questions: cloneExamQuestions(source),
    shuffle_questions: false,
    shuffle_choices: false,
  };
  return updateExam(examId, { versions: [...exam.versions, version] });
}

export async function duplicateExamVersion(examId: string, versionIndex: number): Promise<Exam> {
  const exam = await getExam(examId);
  if (!exam) throw new Error('ไม่พบชุดข้อสอบ');
  const source = exam.versions[versionIndex];
  if (!source) throw new Error('ไม่พบเวอร์ชัน');
  const version: ExamVersion = {
    version_label: nextExamVersionLabel(exam.versions),
    questions: cloneExamQuestions(source.questions),
    shuffle_questions: source.shuffle_questions,
    shuffle_choices: source.shuffle_choices,
  };
  return updateExam(examId, { versions: [...exam.versions, version] });
}

// ─── Generation jobs ───────────────────────────────────────────────────────

export async function listGenerationJobs(): Promise<GenerationJob[]> {
  if (isDemoMode || !supabase) return [...demoStore.generationJobs];
  const { data, error } = await requireClient()
    .from('generation_jobs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GenerationJob[];
}

export async function createGenerationJob(job: GenerationJob): Promise<GenerationJob> {
  if (isDemoMode || !supabase) {
    demoStore.generationJobs.push(job);
    return job;
  }
  const { data, error } = await requireClient().from('generation_jobs').insert(job).select().single();
  if (error) throw error;
  return data as GenerationJob;
}

// ─── Notifications ─────────────────────────────────────────────────────────

export async function listNotifications(userId?: string): Promise<Notification[]> {
  if (isDemoMode || !supabase) {
    const list = userId
      ? demoStore.notifications.filter(n => n.user_id === userId)
      : [...demoStore.notifications];
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  let q = requireClient().from('notifications').select('*').order('created_at', { ascending: false });
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isDemoMode || !supabase) {
    const n = demoStore.notifications.find(x => x.id === id);
    if (n) n.read = true;
    return;
  }
  const { error } = await requireClient().from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function createNotification(n: Notification): Promise<Notification> {
  if (isDemoMode || !supabase) {
    demoStore.notifications.unshift(n);
    return n;
  }
  const { data, error } = await requireClient().from('notifications').insert(n).select().single();
  if (error) throw error;
  return data as Notification;
}

// ─── Usage / audit ─────────────────────────────────────────────────────────

export async function listUsageLogs(userId?: string): Promise<AIUsageLog[]> {
  if (isDemoMode || !supabase) {
    return userId ? demoStore.usageLogs.filter(u => u.user_id === userId) : [...demoStore.usageLogs];
  }
  let q = requireClient().from('ai_usage_logs').select('*').order('created_at', { ascending: false });
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AIUsageLog[];
}

export async function createUsageLog(log: AIUsageLog): Promise<AIUsageLog> {
  if (isDemoMode || !supabase) {
    demoStore.usageLogs.unshift(log);
    return log;
  }
  const { data, error } = await requireClient().from('ai_usage_logs').insert(log).select().single();
  if (error) throw error;
  return data as AIUsageLog;
}

// ─── Dashboard aggregates ──────────────────────────────────────────────────

export async function getDashboardData(userId?: string) {
  const [courses, questions, blueprints, usageLogs, reviews, notifications] = await Promise.all([
    listCourses(),
    listQuestions(),
    listBlueprints(),
    listUsageLogs(),
    listReviews(),
    listNotifications(userId),
  ]);
  return { courses, questions, blueprints, usageLogs, reviews, notifications };
}

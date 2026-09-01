import { supabase, isDemoMode } from './supabase';
import { demoStore } from './demo-data';
import type {
  Course,
  LearningOutcome,
  TestBlueprint,
  Question,
  Exam,
  GenerationJob,
  QuestionReview,
  Notification,
  AIUsageLog,
  BloomLevel,
  DifficultyLevel,
  QuestionStatus,
} from '../types';

function requireClient() {
  if (!supabase) throw new Error('Supabase client is not configured');
  return supabase;
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
    const mapped = rows.map((r, i) => ({
      id: r.id || `q-gen-${Date.now()}-${i}`,
      course_id: r.course_id || '',
      question_type: r.question_type || 'multiple_choice_single',
      question_text: r.question_text || '',
      language: r.language || 'th',
      topic: r.topic ?? null,
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
      created_at: r.created_at || new Date().toISOString(),
      updated_at: r.updated_at || new Date().toISOString(),
      used_count: r.used_count ?? 0,
      exposure_level: r.exposure_level || 'new',
    })) as Question[];
    demoStore.questions.push(...mapped);
    return mapped;
  }
  const { data, error } = await requireClient().from('questions').insert(rows).select();
  if (error) throw error;
  return (data || []) as Question[];
}

export async function updateQuestion(questionId: string, patch: Partial<Question>): Promise<Question> {
  if (isDemoMode || !supabase) {
    const q = demoStore.questions.find(x => x.id === questionId);
    if (!q) throw new Error('Question not found');
    Object.assign(q, patch, { updated_at: new Date().toISOString() });
    return q;
  }
  const { data, error } = await requireClient()
    .from('questions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', questionId)
    .select()
    .single();
  if (error) throw error;
  return data as Question;
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

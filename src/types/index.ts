export type UserRole = 'instructor' | 'reviewer' | 'academic_admin' | 'system_admin';
export type QuestionType = 'multiple_choice_single' | 'multiple_choice_multiple' | 'true_false' | 'matching' | 'fill_in_blank' | 'short_answer' | 'essay' | 'case_study' | 'calculation' | 'coding' | 'oral_question';
export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'advanced';
export type QuestionStatus = 'draft' | 'ai_generated' | 'validation_failed' | 'ready_for_review' | 'under_review' | 'revision_requested' | 'approved' | 'rejected' | 'published' | 'archived';
export type Language = 'th' | 'en';
export type ExamType = 'midterm' | 'final' | 'quiz' | 'pre_test' | 'post_test' | 'practice' | 'certification' | 'placement';
export type DocumentStatus = 'uploaded' | 'validating' | 'processing' | 'indexed' | 'failed' | 'archived';
export type GenerationJobStatus = 'queued' | 'running' | 'validating' | 'partially_completed' | 'completed' | 'failed' | 'cancelled';
export type ExposureLevel = 'new' | 'low' | 'medium' | 'high' | 'retired';

export interface Profile { id: string; email: string; full_name: string; role: UserRole; avatar_url?: string | null; department?: string | null; created_at: string; }
export interface Course { id: string; course_code: string; course_name_th: string; course_name_en?: string | null; description?: string | null; credits: number; level?: string | null; faculty?: string | null; department?: string | null; semester: string; academic_year: string; instructor_id: string; language: Language; status: string; visibility: string; created_at: string; }
export interface LearningOutcome { id: string; code: string; title: string; description: string; outcome_type: 'PLO'|'CLO'|'LO'|'topic'; course_id: string; parent_outcome_id?: string | null; bloom_level?: BloomLevel | null; assessment_method?: string | null; weight?: number | null; status: string; created_at: string; }
export interface CourseTopic { id: string; course_id: string; title: string; description?: string | null; week_number?: number | null; sort_order: number; }
export interface Document { id: string; course_id: string; file_name: string; file_type: string; file_size: number; status: DocumentStatus; uploaded_by: string; created_at: string; description?: string | null; file_path?: string | null; extracted_text?: string | null; updated_at?: string; }
export interface BlueprintRow { id: string; topic: string; clo_code: string; bloom: BloomLevel; difficulty: DifficultyLevel; question_type: QuestionType; num_questions: number; marks_per_question: number; }
export interface TestBlueprint { id: string; course_id: string; name: string; exam_type: ExamType; total_questions: number; total_marks: number; duration_minutes: number; language: Language; instructions?: string | null; rows: BlueprintRow[]; status: string; created_at: string; }
export interface QuestionChoice { id: string; text: string; is_correct: boolean; rationale: string; }
export interface SourceReference { document_id: string; file_name: string; page: number; section: string; quote: string | null; }
export interface RubricPerformanceLevel { level: string; description: string; marks_range: string; }
export interface RubricCriterion { criterion: string; description: string; max_marks: number; performance_levels: RubricPerformanceLevel[]; }
export interface Rubric { total_marks: number; criteria: RubricCriterion[]; }
export interface Question {
  id: string; course_id: string; question_type: QuestionType; question_text: string; language: Language; topic?: string | null;
  choices?: QuestionChoice[] | null; correct_answer: string | string[]; explanation: string;
  intended_bloom_level: BloomLevel; ai_predicted_bloom_level?: BloomLevel | null; reviewer_confirmed_bloom_level?: BloomLevel | null;
  intended_difficulty: DifficultyLevel; ai_predicted_difficulty?: DifficultyLevel | null; reviewer_confirmed_difficulty?: DifficultyLevel | null;
  marks: number; estimated_answer_time_minutes: number; source_references?: SourceReference[] | null; rubric?: Rubric | null;
  learning_outcome_codes: string[]; quality_flags: string[]; quality_score?: number | null; status: QuestionStatus;
  source_type: 'ai_generated'|'human_written'; created_by: string; generated_by_ai: boolean; ai_model?: string | null;
  approved_by?: string | null; approved_at?: string | null; created_at: string; updated_at: string;
  used_count: number; first_used_at?: string | null; last_used_at?: string | null; exposure_level: ExposureLevel;
}
export interface ExamQuestion { question_id: string; order: number; marks: number; }
export interface ExamVersion { version_label: string; questions: ExamQuestion[]; shuffle_questions: boolean; shuffle_choices: boolean; }
export interface Exam { id: string; course_id: string; name: string; exam_type: ExamType; academic_year: string; semester: string; exam_date?: string | null; duration_minutes: number; total_marks: number; instructions?: string | null; questions: ExamQuestion[]; versions: ExamVersion[]; status: string; created_at: string; }
export interface GenerationJob { id: string; course_id: string; blueprint_id?: string | null; document_ids: string[]; learning_outcome_ids: string[]; question_type: QuestionType; bloom_level: BloomLevel; difficulty: DifficultyLevel; number_of_questions: number; language: Language; marks_per_question: number; include_explanation: boolean; include_rubric: boolean; status: GenerationJobStatus; generated_count: number; failed_count: number; total_questions: number; input_tokens?: number | null; output_tokens?: number | null; estimated_cost_usd?: number | null; model?: string | null; created_by: string; created_at: string; completed_at?: string | null; }
export interface QuestionReview { id: string; question_id: string; reviewer_id: string; reviewer_name: string; decision: 'approved'|'rejected'|'revision_requested'; comment: string; confirmed_bloom?: BloomLevel | null; confirmed_difficulty?: DifficultyLevel | null; created_at: string; }
export interface Notification { id: string; user_id: string; type: string; title: string; message: string; link?: string | null; read: boolean; created_at: string; }
export interface AIUsageLog { id: string; user_id: string; course_id: string; provider: string; model: string; request_type: string; input_tokens: number; output_tokens: number; estimated_cost_usd: number; latency_ms: number; status: string; created_at: string; }
export interface AuditLog { id: string; user_id: string; user_name: string; action: string; entity_type: string; entity_id: string; details?: string | null; created_at: string; }

export interface QuestionGenerationRequest { courseId: string; blueprintId?: string; documentIds: string[]; learningOutcomeIds: string[]; questionType: QuestionType; bloomLevel: BloomLevel; difficulty: DifficultyLevel; numberOfQuestions: number; language: Language; marksPerQuestion: number; includeExplanation: boolean; includeRubric: boolean; }
export interface GeneratedQuestion { questionText: string; questionType: QuestionType; language: Language; choices?: QuestionChoice[]; correctAnswer: string | string[]; explanation: string; bloomLevel: BloomLevel; difficulty: DifficultyLevel; learningOutcomeCodes: string[]; topic: string; marks: number; estimatedAnswerTimeMinutes: number; sourceReferences: SourceReference[]; rubric?: Rubric; qualityFlags: string[]; }
export interface QuestionGenerationResult { questions: GeneratedQuestion[]; inputTokens: number; outputTokens: number; model: string; provider: string; }

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { multiple_choice_single:'ปรนัยคำตอบเดียว', multiple_choice_multiple:'ปรนัยหลายคำตอบ', true_false:'ถูกหรือผิด', matching:'จับคู่', fill_in_blank:'เติมคำ', short_answer:'คำตอบสั้น', essay:'อัตนัย', case_study:'กรณีศึกษา', calculation:'คำนวณ', coding:'เขียนโปรแกรม', oral_question:'คำถามปากเปล่า' };
export const BLOOM_LABELS: Record<BloomLevel, string> = { remember:'จำ', understand:'เข้าใจ', apply:'ประยุกต์ใช้', analyze:'วิเคราะห์', evaluate:'ประเมินค่า', create:'สร้างสรรค์' };
export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = { easy:'ง่าย', medium:'ปานกลาง', hard:'ยาก', advanced:'ขั้นสูง' };
export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = { draft:'ร่าง', ai_generated:'AI สร้างแล้ว', validation_failed:'ตรวจสอบไม่ผ่าน', ready_for_review:'พร้อมตรวจ', under_review:'กำลังตรวจ', revision_requested:'ต้องแก้ไข', approved:'อนุมัติแล้ว', rejected:'ปฏิเสธ', published:'เผยแพร่แล้ว', archived:'จัดเก็บ' };
export const ROLE_LABELS: Record<UserRole, string> = { instructor:'อาจารย์ผู้สอน', reviewer:'ผู้ตรวจข้อสอบ', academic_admin:'ผู้ดูแลวิชาการ', system_admin:'ผู้ดูแลระบบ' };
export const EXAM_TYPE_LABELS: Record<ExamType, string> = { midterm:'สอบกลางภาค', final:'สอบปลายภาค', quiz:'แบบทดสอบ', pre_test:'สอบก่อนเรียน', post_test:'สอบหลังเรียน', practice:'ฝึกหัด', certification:'สอบวุฒิบัตร', placement:'สอบวัดระดับ' };
export const QUESTION_STATUS_BADGE: Record<QuestionStatus, 'primary'|'success'|'warning'|'error'|'neutral'|'accent'> = { draft:'neutral', ai_generated:'primary', validation_failed:'error', ready_for_review:'warning', under_review:'accent', revision_requested:'warning', approved:'success', rejected:'error', published:'success', archived:'neutral' };

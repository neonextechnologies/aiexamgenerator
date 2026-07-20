/*
# Create all core tables for AI Exam Generator

1. Purpose
- Set up the complete database schema for the AI Exam Generator application
- This is a fresh database, so all tables are created from scratch

2. New Tables (13 total)
- profiles: user profile information
- courses: course management
- learning_outcomes: CLO/PLO/LO hierarchy
- course_topics: weekly course topics
- documents: uploaded course materials with extracted text
- test_blueprints: exam blueprint definitions
- questions: question bank with full metadata
- exams: assembled exam sets with versions
- generation_jobs: AI question generation job tracking
- question_reviews: human review records
- notifications: user notification feed
- ai_usage_logs: AI API usage and cost tracking
- audit_logs: system audit trail

3. Security
- RLS enabled on all tables
- Single-tenant app with demo mode: anon + authenticated CRUD access
- Storage bucket "course-documents" with anon+authenticated policies

4. Notes
- Uses text primary keys for flexibility (supports both demo IDs and UUIDs)
- JSONB columns for complex nested structures (choices, rubric, blueprint rows, etc.)
- Indexes on frequently queried columns (course_id, status, question_id, user_id)
*/

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'instructor',
  avatar_url text,
  department text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_profiles" ON profiles;
CREATE POLICY "anon_select_profiles" ON profiles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_profiles" ON profiles;
CREATE POLICY "anon_insert_profiles" ON profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_profiles" ON profiles;
CREATE POLICY "anon_update_profiles" ON profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_profiles" ON profiles;
CREATE POLICY "anon_delete_profiles" ON profiles FOR DELETE TO anon, authenticated USING (true);

-- ============ courses ============
CREATE TABLE IF NOT EXISTS courses (
  id text PRIMARY KEY,
  course_code text NOT NULL,
  course_name_th text NOT NULL,
  course_name_en text,
  description text,
  credits integer NOT NULL DEFAULT 3,
  level text,
  faculty text,
  department text,
  semester text NOT NULL,
  academic_year text NOT NULL,
  instructor_id text,
  language text NOT NULL DEFAULT 'th',
  status text NOT NULL DEFAULT 'active',
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_courses" ON courses;
CREATE POLICY "anon_select_courses" ON courses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_courses" ON courses;
CREATE POLICY "anon_insert_courses" ON courses FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_courses" ON courses;
CREATE POLICY "anon_update_courses" ON courses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_courses" ON courses;
CREATE POLICY "anon_delete_courses" ON courses FOR DELETE TO anon, authenticated USING (true);

-- ============ learning_outcomes ============
CREATE TABLE IF NOT EXISTS learning_outcomes (
  id text PRIMARY KEY,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  outcome_type text NOT NULL DEFAULT 'CLO',
  course_id text NOT NULL,
  parent_outcome_id text,
  bloom_level text,
  assessment_method text,
  weight numeric,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE learning_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_learning_outcomes" ON learning_outcomes;
CREATE POLICY "anon_select_learning_outcomes" ON learning_outcomes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_learning_outcomes" ON learning_outcomes;
CREATE POLICY "anon_insert_learning_outcomes" ON learning_outcomes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_learning_outcomes" ON learning_outcomes;
CREATE POLICY "anon_update_learning_outcomes" ON learning_outcomes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_learning_outcomes" ON learning_outcomes;
CREATE POLICY "anon_delete_learning_outcomes" ON learning_outcomes FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_course_id ON learning_outcomes(course_id);

-- ============ course_topics ============
CREATE TABLE IF NOT EXISTS course_topics (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  title text NOT NULL,
  description text,
  week_number integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE course_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_course_topics" ON course_topics;
CREATE POLICY "anon_select_course_topics" ON course_topics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_course_topics" ON course_topics;
CREATE POLICY "anon_insert_course_topics" ON course_topics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_course_topics" ON course_topics;
CREATE POLICY "anon_update_course_topics" ON course_topics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_course_topics" ON course_topics;
CREATE POLICY "anon_delete_course_topics" ON course_topics FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_course_topics_course_id ON course_topics(course_id);

-- ============ documents ============
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  file_path text,
  extracted_text text,
  status text NOT NULL DEFAULT 'uploaded',
  uploaded_by text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_documents" ON documents;
CREATE POLICY "anon_select_documents" ON documents FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_documents" ON documents;
CREATE POLICY "anon_insert_documents" ON documents FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_documents" ON documents;
CREATE POLICY "anon_update_documents" ON documents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_documents" ON documents;
CREATE POLICY "anon_delete_documents" ON documents FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_documents_course_id ON documents(course_id);

-- ============ test_blueprints ============
CREATE TABLE IF NOT EXISTS test_blueprints (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  name text NOT NULL,
  exam_type text NOT NULL DEFAULT 'midterm',
  total_questions integer NOT NULL DEFAULT 0,
  total_marks integer NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 60,
  language text NOT NULL DEFAULT 'th',
  instructions text,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE test_blueprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_test_blueprints" ON test_blueprints;
CREATE POLICY "anon_select_test_blueprints" ON test_blueprints FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_test_blueprints" ON test_blueprints;
CREATE POLICY "anon_insert_test_blueprints" ON test_blueprints FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_test_blueprints" ON test_blueprints;
CREATE POLICY "anon_update_test_blueprints" ON test_blueprints FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_test_blueprints" ON test_blueprints;
CREATE POLICY "anon_delete_test_blueprints" ON test_blueprints FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_test_blueprints_course_id ON test_blueprints(course_id);

-- ============ questions ============
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'multiple_choice_single',
  language text NOT NULL DEFAULT 'th',
  choices jsonb,
  correct_answer text,
  explanation text,
  intended_bloom_level text NOT NULL DEFAULT 'understand',
  ai_predicted_bloom_level text,
  reviewer_confirmed_bloom_level text,
  intended_difficulty text NOT NULL DEFAULT 'medium',
  ai_predicted_difficulty text,
  reviewer_confirmed_difficulty text,
  marks integer NOT NULL DEFAULT 1,
  estimated_answer_time_minutes integer NOT NULL DEFAULT 2,
  source_references jsonb,
  rubric jsonb,
  learning_outcome_codes jsonb DEFAULT '[]'::jsonb,
  quality_flags jsonb DEFAULT '[]'::jsonb,
  quality_score integer,
  topic text,
  status text NOT NULL DEFAULT 'draft',
  source_type text NOT NULL DEFAULT 'ai_generated',
  created_by text,
  generated_by_ai boolean NOT NULL DEFAULT true,
  ai_model text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  used_count integer NOT NULL DEFAULT 0,
  first_used_at timestamptz,
  last_used_at timestamptz,
  exposure_level text NOT NULL DEFAULT 'new'
);
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_questions" ON questions;
CREATE POLICY "anon_select_questions" ON questions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_questions" ON questions;
CREATE POLICY "anon_insert_questions" ON questions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_questions" ON questions;
CREATE POLICY "anon_update_questions" ON questions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_questions" ON questions;
CREATE POLICY "anon_delete_questions" ON questions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_questions_course_id ON questions(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);

-- ============ exams ============
CREATE TABLE IF NOT EXISTS exams (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  name text NOT NULL,
  exam_type text NOT NULL DEFAULT 'midterm',
  academic_year text,
  semester text,
  exam_date date,
  duration_minutes integer NOT NULL DEFAULT 60,
  total_marks integer NOT NULL DEFAULT 0,
  instructions text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_exams" ON exams;
CREATE POLICY "anon_select_exams" ON exams FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_exams" ON exams;
CREATE POLICY "anon_insert_exams" ON exams FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_exams" ON exams;
CREATE POLICY "anon_update_exams" ON exams FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_exams" ON exams;
CREATE POLICY "anon_delete_exams" ON exams FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_exams_course_id ON exams(course_id);

-- ============ generation_jobs ============
CREATE TABLE IF NOT EXISTS generation_jobs (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  blueprint_id text,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  learning_outcome_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_type text NOT NULL DEFAULT 'multiple_choice_single',
  bloom_level text NOT NULL DEFAULT 'apply',
  difficulty text NOT NULL DEFAULT 'medium',
  number_of_questions integer NOT NULL DEFAULT 5,
  language text NOT NULL DEFAULT 'th',
  marks_per_question integer NOT NULL DEFAULT 1,
  include_explanation boolean NOT NULL DEFAULT true,
  include_rubric boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued',
  generated_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric,
  model text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_generation_jobs" ON generation_jobs;
CREATE POLICY "anon_select_generation_jobs" ON generation_jobs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_generation_jobs" ON generation_jobs;
CREATE POLICY "anon_insert_generation_jobs" ON generation_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_generation_jobs" ON generation_jobs;
CREATE POLICY "anon_update_generation_jobs" ON generation_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_generation_jobs" ON generation_jobs;
CREATE POLICY "anon_delete_generation_jobs" ON generation_jobs FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_course_id ON generation_jobs(course_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);

-- ============ question_reviews ============
CREATE TABLE IF NOT EXISTS question_reviews (
  id text PRIMARY KEY,
  question_id text NOT NULL,
  reviewer_id text NOT NULL,
  reviewer_name text,
  decision text NOT NULL,
  comment text,
  confirmed_bloom text,
  confirmed_difficulty text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE question_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_question_reviews" ON question_reviews;
CREATE POLICY "anon_select_question_reviews" ON question_reviews FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_question_reviews" ON question_reviews;
CREATE POLICY "anon_insert_question_reviews" ON question_reviews FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_question_reviews" ON question_reviews;
CREATE POLICY "anon_update_question_reviews" ON question_reviews FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_question_reviews" ON question_reviews;
CREATE POLICY "anon_delete_question_reviews" ON question_reviews FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_question_reviews_question_id ON question_reviews(question_id);

-- ============ notifications ============
CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_notifications" ON notifications;
CREATE POLICY "anon_select_notifications" ON notifications FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_notifications" ON notifications;
CREATE POLICY "anon_insert_notifications" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_notifications" ON notifications;
CREATE POLICY "anon_update_notifications" ON notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_notifications" ON notifications;
CREATE POLICY "anon_delete_notifications" ON notifications FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- ============ ai_usage_logs ============
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  course_id text,
  provider text NOT NULL DEFAULT 'openai',
  model text,
  request_type text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_ai_usage_logs" ON ai_usage_logs;
CREATE POLICY "anon_select_ai_usage_logs" ON ai_usage_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ai_usage_logs" ON ai_usage_logs;
CREATE POLICY "anon_insert_ai_usage_logs" ON ai_usage_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ai_usage_logs" ON ai_usage_logs;
CREATE POLICY "anon_update_ai_usage_logs" ON ai_usage_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ai_usage_logs" ON ai_usage_logs;
CREATE POLICY "anon_delete_ai_usage_logs" ON ai_usage_logs FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);

-- ============ audit_logs ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  user_id text,
  user_name text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_audit_logs" ON audit_logs;
CREATE POLICY "anon_select_audit_logs" ON audit_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audit_logs" ON audit_logs;
CREATE POLICY "anon_insert_audit_logs" ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_audit_logs" ON audit_logs;
CREATE POLICY "anon_update_audit_logs" ON audit_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_audit_logs" ON audit_logs;
CREATE POLICY "anon_delete_audit_logs" ON audit_logs FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

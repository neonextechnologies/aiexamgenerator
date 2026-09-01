/*
  V2 Controlled Hybrid AI Examination Platform — schema foundation
  Non-destructive: CREATE IF NOT EXISTS / additive columns only
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ========== Question type registry ==========
CREATE TABLE IF NOT EXISTS question_types (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name_th text NOT NULL,
  name_en text NOT NULL,
  description text,
  requires_choices boolean NOT NULL DEFAULT false,
  requires_answer boolean NOT NULL DEFAULT true,
  supports_rubric boolean NOT NULL DEFAULT false,
  supports_ai_generation boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

INSERT INTO question_types (id, code, name_th, name_en, requires_choices, requires_answer, supports_rubric, sort_order) VALUES
  ('qt-mcq-s', 'multiple_choice_single', 'ปรนัยคำตอบเดียว', 'Multiple Choice — Single', true, true, false, 10),
  ('qt-mcq-m', 'multiple_choice_multiple', 'ปรนัยหลายคำตอบ', 'Multiple Choice — Multiple', true, true, false, 20),
  ('qt-tf', 'true_false', 'ถูกหรือผิด', 'True / False', false, true, false, 30),
  ('qt-sa', 'short_answer', 'คำตอบสั้น', 'Short Answer', false, true, false, 40),
  ('qt-essay', 'essay', 'อัตนัย', 'Essay', false, true, true, 50),
  ('qt-fib', 'fill_in_blank', 'เติมคำ', 'Fill in the Blank', false, true, false, 60),
  ('qt-match', 'matching', 'จับคู่', 'Matching', true, true, false, 70),
  ('qt-case', 'case_study', 'กรณีศึกษา', 'Case Study', false, true, true, 80),
  ('qt-scenario', 'scenario_based', 'สถานการณ์', 'Scenario-Based', false, true, true, 90),
  ('qt-ps', 'problem_solving', 'แก้ปัญหา', 'Problem Solving', false, true, true, 100),
  ('qt-calc', 'calculation', 'คำนวณ', 'Calculation', false, true, false, 110),
  ('qt-oral', 'oral_question', 'ปากเปล่า', 'Oral Question', false, true, true, 120)
ON CONFLICT (id) DO NOTHING;

-- ========== Difficulty definitions ==========
CREATE TABLE IF NOT EXISTS difficulty_definitions (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name_th text NOT NULL,
  name_en text NOT NULL,
  description text,
  criteria_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO difficulty_definitions (id, code, name_th, name_en, description, criteria_json, sort_order) VALUES
  ('diff-easy', 'easy', 'ง่าย', 'Easy', 'Direct recall / single-step / explicit source', '{"recall":true,"steps":1}'::jsonb, 1),
  ('diff-medium', 'medium', 'ปานกลาง', 'Medium', 'Understanding / application / multi-concept', '{"steps":2}'::jsonb, 2),
  ('diff-hard', 'hard', 'ยาก', 'Hard', 'Analysis / synthesis / evaluation / scenarios', '{"steps":3}'::jsonb, 3)
ON CONFLICT (id) DO NOTHING;

-- ========== Document chunks (Knowledge Engine) ==========
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  course_id text,
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  page_number integer,
  section text,
  heading text,
  token_count integer NOT NULL DEFAULT 0,
  embedding vector(1536),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_course_id ON document_chunks(course_id);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_stage text DEFAULT 'uploaded';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS organization_id text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS evidence_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS evidence_pack_id text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS verification_status text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS verification_score numeric;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_dimensions jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS generation_mode text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS workflow_run_id text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS notes text;

-- ========== AI Providers ==========
CREATE TABLE IF NOT EXISTS ai_providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider_type text NOT NULL, -- demo|openai|gemini|anthropic|openai_compatible
  is_enabled boolean NOT NULL DEFAULT false,
  base_url text,
  default_model text,
  analysis_model text,
  generation_model text,
  verification_model text,
  embedding_model text,
  temperature numeric DEFAULT 0.3,
  max_tokens integer DEFAULT 8000,
  timeout_ms integer DEFAULT 120000,
  daily_limit integer,
  monthly_budget_usd numeric,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- secret_ref points to env/secret name; never store raw keys in plaintext for production
  secret_ref text,
  encrypted_api_key text,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO ai_providers (id, name, provider_type, is_enabled, default_model, generation_model, analysis_model, verification_model, embedding_model, secret_ref) VALUES
  ('prov-demo', 'Demo Provider', 'demo', true, 'demo-model', 'demo-model', 'demo-model', 'demo-model', 'demo-embed', null),
  ('prov-openai', 'OpenAI', 'openai', false, 'gpt-4o', 'gpt-4o', 'gpt-4o', 'gpt-4o-mini', 'text-embedding-3-small', 'OPENAI_API_KEY'),
  ('prov-gemini', 'Google Gemini', 'gemini', false, 'gemini-1.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash', 'text-embedding-004', 'GEMINI_API_KEY'),
  ('prov-anthropic', 'Anthropic Claude', 'anthropic', false, 'claude-3-5-sonnet-latest', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-5-haiku-latest', null, 'ANTHROPIC_API_KEY'),
  ('prov-compat', 'OpenAI-Compatible', 'openai_compatible', false, 'gpt-4o', 'gpt-4o', 'gpt-4o', 'gpt-4o', 'text-embedding-3-small', 'COMPAT_API_KEY')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS prompt_templates (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  task_type text NOT NULL,
  name text NOT NULL,
  system_prompt text NOT NULL,
  user_template text NOT NULL,
  output_schema jsonb,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO prompt_templates (id, code, task_type, name, system_prompt, user_template, version) VALUES
  ('pt-gen-v1', 'question_generation', 'question_generation', 'Default Question Generation',
   'You are an expert educational assessment designer. Return ONLY valid JSON matching the schema. Use ONLY the provided evidence. If evidence is insufficient, return {"status":"INSUFFICIENT_EVIDENCE","questions":[]}.',
   'Course: {{course}}\nMode: {{mode}}\nLO: {{learningOutcomes}}\nType: {{questionType}}\nBloom: {{bloom}}\nDifficulty: {{difficulty}}\nCount: {{count}}\nLanguage: {{language}}\nRules: {{rules}}\nEvidence:\n{{evidence}}',
   1),
  ('pt-analyze-v1', 'analysis', 'analysis', 'Default Analysis',
   'Analyze evidence coverage for exam generation. Return JSON with decision, reason, coverage, recommendations, generationPlan.',
   'Request:\n{{request}}\nEvidence:\n{{evidence}}',
   1),
  ('pt-verify-v1', 'verification', 'verification', 'Default Verification',
   'Verify exam questions against evidence and rules. Return JSON status/score/checks/violations/recommendations.',
   'Questions:\n{{questions}}\nEvidence:\n{{evidence}}\nRules:\n{{rules}}',
   1),
  ('pt-chat-v1', 'chat', 'chat', 'Default Assistant',
   'You are an exam-design copilot for Thai higher education. Propose actions; never silently mutate. Reply in the user language.',
   'Context:\n{{context}}\nMessage:\n{{message}}',
   1)
ON CONFLICT (id) DO NOTHING;

-- ========== Rules ==========
CREATE TABLE IF NOT EXISTS rule_sets (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'SYSTEM',
  is_active boolean NOT NULL DEFAULT true,
  organization_id text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rules (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'SYSTEM',
  priority integer NOT NULL DEFAULT 100,
  rule_type text NOT NULL,
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'warning', -- info|warning|error|critical
  is_blocking boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  organization_id text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rule_set_rules (
  rule_set_id text NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
  rule_id text NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_set_id, rule_id)
);

CREATE TABLE IF NOT EXISTS rule_executions (
  id text PRIMARY KEY,
  rule_set_id text,
  workflow_run_id text,
  generation_job_id text,
  input_json jsonb,
  result_json jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rule_violations (
  id text PRIMARY KEY,
  execution_id text,
  rule_id text,
  entity_type text,
  entity_id text,
  severity text,
  message text,
  details_json jsonb,
  created_at timestamptz DEFAULT now()
);

INSERT INTO rule_sets (id, name, description, scope) VALUES
  ('rs-system-default', 'System Default Rules', 'Mandatory academic quality rules', 'SYSTEM')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rules (id, code, name, description, scope, priority, rule_type, condition_json, action_json, severity, is_blocking, is_locked) VALUES
  ('rule-kb-1', 'KNOWLEDGE_BOUNDED', 'Knowledge Bounded', 'Questions must be grounded in selected documents', 'MANDATORY', 10, 'knowledge', '{"knowledge_bounded":true}'::jsonb, '{"require_evidence":true}'::jsonb, 'error', true, true),
  ('rule-clo-1', 'REQUIRE_CLO', 'Require CLO Mapping', 'Every question maps to at least one CLO', 'MANDATORY', 20, 'learning_outcome', '{}'::jsonb, '{"require_clo":true}'::jsonb, 'error', true, true),
  ('rule-src-1', 'REQUIRE_SOURCE', 'Require Source Reference', 'Source reference mandatory when knowledge-bounded', 'MANDATORY', 30, 'knowledge', '{"knowledge_bounded":true}'::jsonb, '{"require_source":true}'::jsonb, 'error', true, false),
  ('rule-mcq-1', 'MCQ_SINGLE_ANSWER', 'MCQ Single Correct', 'Single-answer MCQ must have exactly one correct choice', 'SYSTEM', 40, 'question_quality', '{"question_type":"multiple_choice_single"}'::jsonb, '{"exact_correct_count":1}'::jsonb, 'error', true, true),
  ('rule-mcq-4', 'MCQ_FOUR_CHOICES', 'MCQ Four Choices', 'MCQ should have 4 choices', 'SYSTEM', 50, 'question_quality', '{"question_type":"multiple_choice_single"}'::jsonb, '{"choice_count":4}'::jsonb, 'warning', false, false),
  ('rule-bloom-1', 'BLOOM_ALIGN', 'Bloom Alignment', 'Flag intended vs predicted Bloom mismatch', 'SYSTEM', 60, 'bloom', '{}'::jsonb, '{"flag_mismatch":true}'::jsonb, 'warning', false, false),
  ('rule-dup-1', 'NO_DUPLICATE', 'No Duplicate Questions', 'Reject near-duplicate content hash', 'SYSTEM', 70, 'question_quality', '{}'::jsonb, '{"check_hash":true}'::jsonb, 'error', true, false),
  ('rule-amb-1', 'NO_AMBIGUITY', 'Avoid Ambiguity', 'Questions must be unambiguous', 'SYSTEM', 80, 'question_quality', '{}'::jsonb, '{"flag_ambiguity":true}'::jsonb, 'warning', false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rule_set_rules (rule_set_id, rule_id)
SELECT 'rs-system-default', id FROM rules
ON CONFLICT DO NOTHING;

-- ========== Workflows ==========
CREATE TABLE IF NOT EXISTS workflows (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  organization_id text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_versions (
  id text PRIMARY KEY,
  workflow_id text NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id text PRIMARY KEY,
  workflow_version_id text NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  ai_enabled boolean NOT NULL DEFAULT false,
  manual_approval_required boolean NOT NULL DEFAULT false,
  allowed_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_set_id text,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
  id text PRIMARY KEY,
  workflow_version_id text NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  from_step_id text NOT NULL,
  to_step_id text NOT NULL,
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id text PRIMARY KEY,
  workflow_id text,
  workflow_version_id text,
  generation_job_id text,
  course_id text,
  mode text,
  status text NOT NULL DEFAULT 'running',
  current_step text,
  input_json jsonb,
  output_json jsonb,
  created_by text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS workflow_step_runs (
  id text PRIMARY KEY,
  workflow_run_id text NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt integer NOT NULL DEFAULT 1,
  input_json jsonb,
  output_json jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz
);

INSERT INTO workflows (id, name, description) VALUES
  ('wf-exam-default', 'Default Exam Workflow', 'Controlled hybrid exam generation pipeline')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workflow_versions (id, workflow_id, version, is_published) VALUES
  ('wfv-exam-1', 'wf-exam-default', 1, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO workflow_steps (id, workflow_version_id, code, name, sort_order, ai_enabled, manual_approval_required, rule_set_id) VALUES
  ('wfs-1', 'wfv-exam-1', 'DEFINE', 'Define Request', 10, false, false, null),
  ('wfs-2', 'wfv-exam-1', 'KNOWLEDGE_PREPARE', 'Prepare Knowledge', 20, false, false, null),
  ('wfs-3', 'wfv-exam-1', 'PLAN', 'Plan', 30, true, false, 'rs-system-default'),
  ('wfs-4', 'wfv-exam-1', 'RETRIEVE', 'Retrieve Evidence', 40, false, false, null),
  ('wfs-5', 'wfv-exam-1', 'ANALYZE', 'Analyze & Decide', 50, true, false, 'rs-system-default'),
  ('wfs-6', 'wfv-exam-1', 'GENERATE', 'Generate Questions', 60, true, false, 'rs-system-default'),
  ('wfs-7', 'wfv-exam-1', 'VERIFY', 'Verify', 70, true, false, 'rs-system-default'),
  ('wfs-8', 'wfv-exam-1', 'HUMAN_REVIEW', 'Human Review', 80, false, true, null),
  ('wfs-9', 'wfv-exam-1', 'APPROVE', 'Approve', 90, false, true, null),
  ('wfs-10', 'wfv-exam-1', 'DELIVER', 'Deliver', 100, false, false, null)
ON CONFLICT (id) DO NOTHING;

-- ========== Verification & executions ==========
CREATE TABLE IF NOT EXISTS generation_executions (
  id text PRIMARY KEY,
  generation_job_id text,
  workflow_run_id text,
  mode text,
  course_id text,
  user_id text,
  rule_set_id text,
  provider_id text,
  model text,
  prompt_template_id text,
  prompt_version integer,
  knowledge_bounded boolean NOT NULL DEFAULT true,
  evidence_pack jsonb,
  analysis_result jsonb,
  request_json jsonb,
  output_json jsonb,
  verification_json jsonb,
  corrections jsonb DEFAULT '[]'::jsonb,
  token_usage jsonb,
  estimated_cost_usd numeric,
  status text NOT NULL DEFAULT 'started',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS verification_runs (
  id text PRIMARY KEY,
  execution_id text,
  question_id text,
  status text NOT NULL,
  score numeric,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ========== Chat ==========
CREATE TABLE IF NOT EXISTS chat_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  course_id text,
  context_type text,
  context_id text,
  title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_actions (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  message_id text,
  action_type text NOT NULL,
  payload_json jsonb,
  status text NOT NULL DEFAULT 'proposed', -- proposed|confirmed|executed|cancelled
  created_at timestamptz DEFAULT now(),
  executed_at timestamptz
);

-- ========== Email & notifications ==========
CREATE TABLE IF NOT EXISTS email_providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider_type text NOT NULL, -- smtp|resend|sendgrid|demo
  is_enabled boolean NOT NULL DEFAULT false,
  host text,
  port integer,
  username text,
  from_name text,
  from_email text,
  reply_to text,
  encryption text,
  secret_ref text,
  encrypted_secret text,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

INSERT INTO email_providers (id, name, provider_type, is_enabled, from_name, from_email) VALUES
  ('email-demo', 'Demo Email (log only)', 'demo', true, 'AI Exam Generator', 'noreply@example.com')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS email_templates (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  variables jsonb DEFAULT '[]'::jsonb,
  language text NOT NULL DEFAULT 'th',
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO email_templates (id, code, subject, body_html, body_text, language) VALUES
  ('et-gen-done', 'generation_completed', 'สร้างข้อสอบเสร็จสิ้น', '<p>งานสร้างข้อสอบเสร็จแล้ว {{count}} ข้อ</p>', 'งานสร้างข้อสอบเสร็จแล้ว {{count}} ข้อ', 'th'),
  ('et-gen-fail', 'generation_failed', 'สร้างข้อสอบล้มเหลว', '<p>งานสร้างข้อสอบล้มเหลว: {{reason}}</p>', 'งานสร้างข้อสอบล้มเหลว: {{reason}}', 'th'),
  ('et-review', 'review_assigned', 'มีข้อสอบรอตรวจ', '<p>มีข้อสอบรอการตรวจทาน</p>', 'มีข้อสอบรอการตรวจทาน', 'th'),
  ('et-approved', 'question_approved', 'ข้อสอบได้รับการอนุมัติ', '<p>ข้อสอบของคุณได้รับการอนุมัติ</p>', 'ข้อสอบของคุณได้รับการอนุมัติ', 'th')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id text PRIMARY KEY,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  categories jsonb NOT NULL DEFAULT '["info","success","warning","error","critical"]'::jsonb,
  digest_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id text PRIMARY KEY,
  notification_id text,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz
);

CREATE TABLE IF NOT EXISTS integrations (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL, -- mcp|rest|webhook|knowledge|lms
  endpoint text,
  auth_type text,
  encrypted_credentials text,
  is_active boolean NOT NULL DEFAULT false,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider_type text NOT NULL DEFAULT 'pgvector',
  is_enabled boolean NOT NULL DEFAULT true,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

INSERT INTO knowledge_providers (id, name, provider_type, is_enabled) VALUES
  ('kp-pgvector', 'Supabase pgvector', 'pgvector', true)
ON CONFLICT (id) DO NOTHING;

-- generation_jobs extensions
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS mode text DEFAULT 'ai';
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS knowledge_bounded boolean DEFAULT true;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS rule_set_id text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS workflow_id text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS workflow_run_id text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS evidence_pack jsonb;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS analysis_result jsonb;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS execution_id text;

-- ========== RLS for new tables ==========
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'question_types','difficulty_definitions','document_chunks','ai_providers','prompt_templates',
    'rule_sets','rules','rule_set_rules','rule_executions','rule_violations',
    'workflows','workflow_versions','workflow_steps','workflow_transitions','workflow_runs','workflow_step_runs',
    'generation_executions','verification_runs','chat_sessions','chat_messages','chat_actions',
    'email_providers','email_templates','notification_preferences','notification_deliveries',
    'integrations','knowledge_providers'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_select_auth', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t||'_select_auth', t);
  END LOOP;
END $$;

-- Authenticated write policies (admins for config; users for own chat/prefs)
DROP POLICY IF EXISTS document_chunks_write ON document_chunks;
CREATE POLICY document_chunks_write ON document_chunks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chat_sessions_own ON chat_sessions;
CREATE POLICY chat_sessions_own ON chat_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS chat_messages_via_session ON chat_messages;
CREATE POLICY chat_messages_via_session ON chat_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id = session_id AND (s.user_id = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id = session_id AND (s.user_id = auth.uid()::text OR public.is_admin())));

DROP POLICY IF EXISTS notification_prefs_own ON notification_preferences;
CREATE POLICY notification_prefs_own ON notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS rules_admin_write ON rules;
CREATE POLICY rules_admin_write ON rules FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS rule_sets_admin_write ON rule_sets;
CREATE POLICY rule_sets_admin_write ON rule_sets FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS workflows_admin_write ON workflows;
CREATE POLICY workflows_admin_write ON workflows FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ai_providers_admin_write ON ai_providers;
CREATE POLICY ai_providers_admin_write ON ai_providers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS generation_executions_insert ON generation_executions;
CREATE POLICY generation_executions_insert ON generation_executions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS generation_executions_select ON generation_executions;
CREATE POLICY generation_executions_select ON generation_executions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS workflow_runs_write ON workflow_runs;
CREATE POLICY workflow_runs_write ON workflow_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS workflow_step_runs_write ON workflow_step_runs;
CREATE POLICY workflow_step_runs_write ON workflow_step_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS verification_runs_write ON verification_runs;
CREATE POLICY verification_runs_write ON verification_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

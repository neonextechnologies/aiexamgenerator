/*
  Real-mode audit fixes: embeddings RPC, pricing, experiments,
  generation job progress, encryption helpers, prompt usage.
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ========== Document chunk embedding metadata ==========
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_provider text;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_dims integer;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- Optional ANN index; safe on empty tables (hnsw). Ignore if extension lacks support.
DO $$
BEGIN
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
      ON document_chunks USING hnsw (embedding vector_cosine_ops);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping hnsw embedding index: %', SQLERRM;
  END;
END $$;

-- Semantic retrieval via pgvector (falls back gracefully when no embeddings)
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_document_ids uuid[],
  match_count integer DEFAULT 8,
  match_threshold float DEFAULT 0.2
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  course_id text,
  chunk_index integer,
  content text,
  page_number integer,
  section text,
  heading text,
  token_count integer,
  metadata_json jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.document_id,
    c.course_id,
    c.chunk_index,
    c.content,
    c.page_number,
    c.section,
    c.heading,
    c.token_count,
    c.metadata_json,
    c.created_at,
    (1 - (c.embedding <=> query_embedding))::float AS similarity
  FROM document_chunks c
  WHERE c.embedding IS NOT NULL
    AND (match_document_ids IS NULL OR c.document_id = ANY(match_document_ids))
    AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- ========== AI model pricing (#12) ==========
CREATE TABLE IF NOT EXISTS ai_model_pricing (
  id text PRIMARY KEY,
  provider_type text NOT NULL,
  model text NOT NULL,
  input_usd_per_1m numeric NOT NULL DEFAULT 2.5,
  output_usd_per_1m numeric NOT NULL DEFAULT 10.0,
  embedding_usd_per_1m numeric,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider_type, model)
);

INSERT INTO ai_model_pricing (id, provider_type, model, input_usd_per_1m, output_usd_per_1m, embedding_usd_per_1m) VALUES
  ('price-gpt4o', 'openai', 'gpt-4o', 2.5, 10.0, null),
  ('price-gpt4o-mini', 'openai', 'gpt-4o-mini', 0.15, 0.6, null),
  ('price-emb-3-small', 'openai', 'text-embedding-3-small', 0, 0, 0.02),
  ('price-gemini-15', 'gemini', 'gemini-1.5-pro', 1.25, 5.0, null),
  ('price-gemini-flash', 'gemini', 'gemini-1.5-flash', 0.075, 0.3, null),
  ('price-gemini-emb', 'gemini', 'text-embedding-004', 0, 0, 0.0),
  ('price-claude-sonnet', 'anthropic', 'claude-3-5-sonnet-latest', 3.0, 15.0, null),
  ('price-claude-haiku', 'anthropic', 'claude-3-5-haiku-latest', 0.8, 4.0, null),
  ('price-compat-default', 'openai_compatible', 'gpt-4o', 0, 0, null)
ON CONFLICT (id) DO NOTHING;

-- ========== Experiments (#15) ==========
CREATE TABLE IF NOT EXISTS experiments (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  hypothesis text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  provider_id text,
  control_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  treatment_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ========== Generation job progress / queue (#13/#14) ==========
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS progress_pct integer DEFAULT 0;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS current_stage text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS stage_message text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS request_json jsonb;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS result_json jsonb;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS workflow_run_id text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS knowledge_bounded boolean DEFAULT true;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS mode text DEFAULT 'ai';
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS rule_set_id text;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_created
  ON generation_jobs(status, created_at);

-- ========== Provider key encryption metadata (#7) ==========
ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS key_encryption text DEFAULT 'legacy_base64';
ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS key_hint text;

-- Symmetric encrypt/decrypt helpers (key supplied by edge via session setting)
CREATE OR REPLACE FUNCTION app_encrypt_secret(plaintext text, secret text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(pgp_sym_encrypt(plaintext, secret), 'base64');
$$;

CREATE OR REPLACE FUNCTION app_decrypt_secret(ciphertext text, secret text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF ciphertext IS NULL OR ciphertext = '' OR secret IS NULL OR secret = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN pgp_sym_decrypt(decode(ciphertext, 'base64'), secret);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

-- ========== Knowledge provider health tracking ==========
ALTER TABLE knowledge_providers ADD COLUMN IF NOT EXISTS last_health_at timestamptz;
ALTER TABLE knowledge_providers ADD COLUMN IF NOT EXISTS last_health_status text;
ALTER TABLE knowledge_providers ADD COLUMN IF NOT EXISTS last_health_message text;

INSERT INTO knowledge_providers (id, name, provider_type, is_enabled, config_json) VALUES
  ('kp-lexical', 'Lexical Fallback', 'lexical', true, '{"role":"fallback"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ========== Integrations seed completeness ==========
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ========== Prompt templates: ensure question_generation + chat/analyze/verify/rubric codes ==========
INSERT INTO prompt_templates (id, code, task_type, name, system_prompt, user_template, version) VALUES
  ('pt-gen-v1', 'question_generation', 'question_generation', 'Default Question Generation',
   'You are an expert educational assessment designer. Return ONLY valid JSON matching the schema. Use ONLY the provided evidence. If evidence is insufficient, return {"status":"INSUFFICIENT_EVIDENCE","questions":[]}.',
   'Course: {{course}}\nMode: {{mode}}\nLO: {{learningOutcomes}}\nType: {{questionType}}\nBloom: {{bloom}}\nDifficulty: {{difficulty}}\nCount: {{count}}\nLanguage: {{language}}\nRules: {{rules}}\nEvidence:\n{{evidence}}',
   1),
  ('pt-chat', 'chat_assistant', 'chat', 'Chat Assistant',
   'You are a Thai/English exam design assistant for Controlled Hybrid mode. Propose actions only; never mutate data without confirmation. Reply in Thai unless the user writes in English.',
   'Context page={{page}} course={{courseId}} exam={{examId}} question={{questionId}}\nUser: {{message}}',
   1),
  ('pt-analyze', 'analyze_request', 'analysis', 'Analyze Generation Request',
   'You are an assessment planner. Decide approve/revise/reject for a knowledge-bounded exam generation request. Return JSON {"decision":"approve|revise|reject","reason":[...],"coverage":{},"recommendedQuestionTypes":[],"recommendedBloomLevels":[],"recommendedDifficulty":[],"generationPlan":[],"insufficientEvidence":false}.',
   'Request: {{requestJson}}\nEvidence coverage: {{coverage}}\nSample evidence:\n{{evidence}}',
   1),
  ('pt-verify', 'verify_question', 'verification', 'Verify Question Quality',
   'You are an exam quality verifier. Score the question. Return JSON {"status":"pass|warning|fail","score":0-100,"checks":[{"code":"","name":"","status":"pass|warning|fail","message":""}],"violations":[],"recommendations":[],"dimensions":{"grounding":0,"correctness":0,"clarity":0,"clo_alignment":0,"bloom_alignment":0,"difficulty_alignment":0,"distractor_quality":0,"language_quality":0,"traceability":0}}.',
   'Question: {{questionJson}}\nEvidence: {{evidence}}\nKnowledgeBounded: {{knowledgeBounded}}',
   1),
  ('pt-predict', 'predict_bloom_difficulty', 'analysis', 'Predict Bloom & Difficulty',
   'Classify the question. Return JSON {"bloomLevel":"remember|understand|apply|analyze|evaluate|create","difficulty":"easy|medium|hard|advanced","confidence":0-1,"rationale":""}.',
   'Question text: {{questionText}}\nType: {{questionType}}\nLanguage: {{language}}',
   1),
  ('pt-rubric-retry', 'rubric_retry', 'generation', 'Rubric Retry',
   'Create a detailed Thai rubric for the question. Return JSON {"rubric":{"totalMarks":N,"criteria":[{"criterion":"","description":"","maxMarks":N,"performanceLevels":[{"level":"ดีเยี่ยม|ดี|พอใช้|ต้องปรับปรุง","description":"","marksRange":""}]}]}}.',
   'Question: {{questionText}}\nType: {{questionType}}\nMarks: {{marks}}\nLanguage: {{language}}',
   1),
  ('pt-manual-assist', 'manual_assist', 'generation', 'Manual Assist',
   'Help an instructor improve a question. Return JSON {"suggestion":"","questionText":"","choices":[],"bloomLevel":"","difficulty":"","note":""}.',
   'Action: {{action}}\nCurrent question: {{questionJson}}\nLanguage: {{language}}',
   1)
ON CONFLICT (id) DO NOTHING;

-- ========== RLS for new tables ==========
ALTER TABLE ai_model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_model_pricing_read ON ai_model_pricing;
CREATE POLICY ai_model_pricing_read ON ai_model_pricing FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ai_model_pricing_admin ON ai_model_pricing;
CREATE POLICY ai_model_pricing_admin ON ai_model_pricing FOR ALL TO authenticated
  USING (COALESCE(current_user_role(), '') IN ('academic_admin', 'system_admin'))
  WITH CHECK (COALESCE(current_user_role(), '') IN ('academic_admin', 'system_admin'));

DROP POLICY IF EXISTS experiments_read ON experiments;
CREATE POLICY experiments_read ON experiments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS experiments_write ON experiments;
CREATE POLICY experiments_write ON experiments FOR ALL TO authenticated
  USING (COALESCE(current_user_role(), '') IN ('academic_admin', 'system_admin', 'instructor'))
  WITH CHECK (COALESCE(current_user_role(), '') IN ('academic_admin', 'system_admin', 'instructor'));

GRANT EXECUTE ON FUNCTION match_document_chunks(vector, uuid[], integer, float) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_encrypt_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION app_decrypt_secret(text, text) TO service_role;

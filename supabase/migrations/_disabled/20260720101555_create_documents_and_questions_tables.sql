/*
# Create documents table for file upload and text extraction

1. New Tables
- `documents`: stores uploaded course documents with extracted text content
- `questions`: stores generated questions with full metadata
2. Security
- Enable RLS on both tables.
- Allow anon + authenticated CRUD (single-tenant app with demo mode).
*/

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
CREATE POLICY "anon_select_documents" ON documents FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_documents" ON documents;
CREATE POLICY "anon_insert_documents" ON documents FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_documents" ON documents;
CREATE POLICY "anon_update_documents" ON documents FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_documents" ON documents;
CREATE POLICY "anon_delete_documents" ON documents FOR DELETE
TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'multiple_choice_single',
  language text NOT NULL DEFAULT 'th',
  choices jsonb,
  correct_answer text,
  explanation text,
  bloom_level text NOT NULL DEFAULT 'understand',
  difficulty text NOT NULL DEFAULT 'medium',
  marks integer NOT NULL DEFAULT 1,
  source_text text,
  learning_outcome_codes jsonb DEFAULT '[]'::jsonb,
  topic text,
  status text NOT NULL DEFAULT 'draft',
  quality_score integer,
  created_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_questions" ON questions;
CREATE POLICY "anon_select_questions" ON questions FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_questions" ON questions FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_questions" ON questions FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_questions" ON questions FOR DELETE
TO anon, authenticated USING (true);

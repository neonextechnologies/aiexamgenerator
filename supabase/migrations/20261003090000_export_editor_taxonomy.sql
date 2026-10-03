/*
# Export, editor history, taxonomy, and duplicate helpers

1. Purpose
- Support question edit audit history for instructor/reviewer edits
- Add managed course tags and question near-duplicate metadata
- Index content_hash for bank-wide duplicate checks

2. Changes
- question_edit_history: snapshots of edits with actor and note
- course_tags: managed tags per course
- questions.near_duplicate_of / near_duplicate_score
- Indexes on questions(content_hash) and questions(topic)
*/

CREATE TABLE IF NOT EXISTS question_edit_history (
  id text PRIMARY KEY,
  question_id text NOT NULL,
  edited_by text NOT NULL,
  editor_name text,
  change_summary text,
  before_json jsonb,
  after_json jsonb,
  source text NOT NULL DEFAULT 'editor',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE question_edit_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_question_edit_history" ON question_edit_history;
CREATE POLICY "anon_select_question_edit_history" ON question_edit_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_question_edit_history" ON question_edit_history;
CREATE POLICY "anon_insert_question_edit_history" ON question_edit_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_question_edit_history" ON question_edit_history;
CREATE POLICY "anon_update_question_edit_history" ON question_edit_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_question_edit_history" ON question_edit_history;
CREATE POLICY "anon_delete_question_edit_history" ON question_edit_history FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_question_edit_history_question_id ON question_edit_history(question_id);

CREATE TABLE IF NOT EXISTS course_tags (
  id text PRIMARY KEY,
  course_id text NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (course_id, name)
);
ALTER TABLE course_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_course_tags" ON course_tags;
CREATE POLICY "anon_select_course_tags" ON course_tags FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_course_tags" ON course_tags;
CREATE POLICY "anon_insert_course_tags" ON course_tags FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_course_tags" ON course_tags;
CREATE POLICY "anon_update_course_tags" ON course_tags FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_course_tags" ON course_tags;
CREATE POLICY "anon_delete_course_tags" ON course_tags FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_course_tags_course_id ON course_tags(course_id);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS near_duplicate_of text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS near_duplicate_score numeric;
CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON questions(content_hash);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);

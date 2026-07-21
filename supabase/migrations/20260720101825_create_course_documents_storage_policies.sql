/*
# Storage policies for course-documents bucket

1. Purpose
- Allow the frontend (anon + authenticated) to upload, read, and delete
  files in the `course-documents` storage bucket so the AI Exam Generator
  can store course materials for text extraction.
2. Security
- Single-tenant demo app: anon AND authenticated roles get CRUD on the bucket.
- Policies are scoped to the bucket `course-documents`.
*/

-- Allow anyone (demo mode + signed in users) to read files
DROP POLICY IF EXISTS "anon_read_course_documents" ON storage.objects;
CREATE POLICY "anon_read_course_documents"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'course-documents');

-- Allow uploads
DROP POLICY IF EXISTS "anon_insert_course_documents" ON storage.objects;
CREATE POLICY "anon_insert_course_documents"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'course-documents');

-- Allow updates (e.g. metadata changes)
DROP POLICY IF EXISTS "anon_update_course_documents" ON storage.objects;
CREATE POLICY "anon_update_course_documents"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'course-documents')
  WITH CHECK (bucket_id = 'course-documents');

-- Allow deletes
DROP POLICY IF EXISTS "anon_delete_course_documents" ON storage.objects;
CREATE POLICY "anon_delete_course_documents"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'course-documents');

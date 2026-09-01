/*
# Storage policies for course-documents bucket (duplicate of 20260720101825)

1. Purpose
- Allow the frontend (anon + authenticated) to upload, read, and delete
  files in the `course-documents` storage bucket.
2. Security
- Single-tenant demo app: anon AND authenticated roles get CRUD on the bucket.
- Policies scoped to bucket `course-documents`.
*/

DROP POLICY IF EXISTS "anon_read_course_documents" ON storage.objects;
CREATE POLICY "anon_read_course_documents"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'course-documents');

DROP POLICY IF EXISTS "anon_insert_course_documents" ON storage.objects;
CREATE POLICY "anon_insert_course_documents"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'course-documents');

DROP POLICY IF EXISTS "anon_update_course_documents" ON storage.objects;
CREATE POLICY "anon_update_course_documents"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'course-documents')
  WITH CHECK (bucket_id = 'course-documents');

DROP POLICY IF EXISTS "anon_delete_course_documents" ON storage.objects;
CREATE POLICY "anon_delete_course_documents"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'course-documents');

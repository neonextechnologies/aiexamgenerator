/*
  Production hardening:
  - Drop open anon CRUD policies
  - Require authenticated users for data access
  - Role helpers for instructor / reviewer / admin
  - Auto-create profile on signup
  - Ensure course-documents storage bucket exists
*/

-- Role helper
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()::text),
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    'instructor'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('reviewer', 'academic_admin', 'system_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('academic_admin', 'system_admin');
$$;

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, department, avatar_url)
  VALUES (
    NEW.id::text,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'instructor'),
    NEW.raw_user_meta_data->>'department',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = COALESCE(EXCLUDED.role, profiles.role),
    department = COALESCE(EXCLUDED.department, profiles.department);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-documents', 'course-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Drop permissive anon policies on all app tables
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','courses','learning_outcomes','course_topics','documents',
    'test_blueprints','questions','exams','generation_jobs','question_reviews',
    'notifications','ai_usage_logs','audit_logs'
  ]
  LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Drop open storage policies
DROP POLICY IF EXISTS "anon_read_course_documents" ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_course_documents" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_course_documents" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_course_documents" ON storage.objects;

-- ===== profiles =====
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own_or_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text OR public.is_admin())
  WITH CHECK (id = auth.uid()::text OR public.is_admin());
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::text OR public.is_admin());

-- ===== courses =====
CREATE POLICY "courses_select_authenticated" ON courses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "courses_insert_instructor" ON courses
  FOR INSERT TO authenticated
  WITH CHECK (instructor_id = auth.uid()::text OR public.is_admin());
CREATE POLICY "courses_update_owner_or_admin" ON courses
  FOR UPDATE TO authenticated
  USING (instructor_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (instructor_id = auth.uid()::text OR public.is_admin());
CREATE POLICY "courses_delete_owner_or_admin" ON courses
  FOR DELETE TO authenticated
  USING (instructor_id = auth.uid()::text OR public.is_admin());

-- ===== learning_outcomes / course_topics / blueprints / documents / questions / exams / jobs =====
CREATE POLICY "learning_outcomes_select" ON learning_outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY "learning_outcomes_write" ON learning_outcomes FOR ALL TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text));

CREATE POLICY "course_topics_select" ON course_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "course_topics_write" ON course_topics FOR ALL TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text));

CREATE POLICY "documents_select" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents_write" ON documents FOR ALL TO authenticated
  USING (public.is_admin() OR uploaded_by = auth.uid()::text OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text))
  WITH CHECK (public.is_admin() OR uploaded_by = auth.uid()::text OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text));

CREATE POLICY "blueprints_select" ON test_blueprints FOR SELECT TO authenticated USING (true);
CREATE POLICY "blueprints_write" ON test_blueprints FOR ALL TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text));

CREATE POLICY "questions_select" ON questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "questions_insert" ON questions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()::text OR public.is_admin() OR public.is_staff());
CREATE POLICY "questions_update" ON questions FOR UPDATE TO authenticated
  USING (created_by = auth.uid()::text OR public.is_staff() OR public.is_admin())
  WITH CHECK (created_by = auth.uid()::text OR public.is_staff() OR public.is_admin());
CREATE POLICY "questions_delete" ON questions FOR DELETE TO authenticated
  USING (created_by = auth.uid()::text OR public.is_admin());

CREATE POLICY "exams_select" ON exams FOR SELECT TO authenticated USING (true);
CREATE POLICY "exams_write" ON exams FOR ALL TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.instructor_id = auth.uid()::text));

CREATE POLICY "generation_jobs_select" ON generation_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "generation_jobs_insert" ON generation_jobs FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()::text OR public.is_admin());
CREATE POLICY "generation_jobs_update" ON generation_jobs FOR UPDATE TO authenticated
  USING (created_by = auth.uid()::text OR public.is_admin())
  WITH CHECK (created_by = auth.uid()::text OR public.is_admin());

CREATE POLICY "reviews_select" ON question_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "reviews_insert" ON question_reviews FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND reviewer_id = auth.uid()::text);
CREATE POLICY "reviews_update" ON question_reviews FOR UPDATE TO authenticated
  USING (public.is_staff() AND reviewer_id = auth.uid()::text)
  WITH CHECK (public.is_staff() AND reviewer_id = auth.uid()::text);

CREATE POLICY "notifications_select_own" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin());
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());
CREATE POLICY "notifications_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "usage_select" ON ai_usage_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR public.is_admin());
CREATE POLICY "usage_insert" ON ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

CREATE POLICY "audit_select_admin" ON audit_logs FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Storage: authenticated only
CREATE POLICY "course_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'course-documents');
CREATE POLICY "course_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-documents');
CREATE POLICY "course_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'course-documents') WITH CHECK (bucket_id = 'course-documents');
CREATE POLICY "course_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'course-documents');

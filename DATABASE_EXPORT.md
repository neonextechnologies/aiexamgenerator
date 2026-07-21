# AI Exam Generator - Database Export

This file documents the complete database schema for the AI Exam Generator application.
All 13 tables are in the `public` schema with Row Level Security (RLS) enabled.

## Tables Overview

| # | Table | Purpose | RLS |
|---|-------|---------|-----|
| 1 | profiles | User profile information | Enabled |
| 2 | courses | Course management | Enabled |
| 3 | learning_outcomes | CLO/PLO/LO hierarchy | Enabled |
| 4 | course_topics | Weekly course topics | Enabled |
| 5 | documents | Uploaded course materials with extracted text | Enabled |
| 6 | test_blueprints | Exam blueprint definitions | Enabled |
| 7 | questions | Question bank with full metadata | Enabled |
| 8 | exams | Assembled exam sets with versions | Enabled |
| 9 | generation_jobs | AI question generation job tracking | Enabled |
| 10 | question_reviews | Human review records | Enabled |
| 11 | notifications | User notification feed | Enabled |
| 12 | ai_usage_logs | AI API usage and cost tracking | Enabled |
| 13 | audit_logs | System audit trail | Enabled |

## RLS Policy Pattern

All tables use the same pattern (single-tenant demo app with anon + authenticated access):

```sql
-- 4 policies per table (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "anon_select_<table>" ON <table> FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_<table>" ON <table> FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_<table>" ON <table> FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_<table>" ON <table> FOR DELETE
  TO anon, authenticated USING (true);
```

## Storage

- Bucket: `course-documents` with anon + authenticated CRUD policies

## Migration Files

All migrations are in `supabase/migrations/`:

1. `20260720101555_create_documents_and_questions_tables.sql` - Initial documents + questions tables
2. `20260720101825_create_course_documents_storage_policies.sql` - Storage bucket policies
3. `20260720115606_create_all_core_tables.sql` - All 13 core tables with RLS
4. `20260720115625_create_course_documents_storage_policies.sql` - Storage policies (duplicate)
5. `20260720131046_create_demo_auth_users_with_roles.sql.sql` - Demo auth users
6. `20260720132220_fix_demo_auth_users_add_identities.sql.sql` - Fix auth identities
7. `20260720143028_fix_gotrue_missing_instance.sql.sql` - Fix GoTrue instance
8. `20260720144123_remove_broken_raw_demo_users.sql.sql` - Remove broken demo users

## Edge Functions

Located in `supabase/functions/`:

1. `extract-document/` - Extracts text from uploaded PDF/DOCX/TXT files
2. `generate-questions/` - Calls OpenAI to generate exam questions
3. `seed-demo-users/` - Creates demo auth users via Admin API

## Demo Auth Users

| Email | Password | Role | Name |
|-------|----------|------|------|
| instructor@example.com | demo1234 | instructor | ดร. สมชาย ใจดี |
| reviewer@example.com | demo1234 | reviewer | ดร. สมหญิง รักงาน |
| academic@example.com | demo1234 | academic_admin | รศ. ดร. วิชัย วิชาการ |
| admin@example.com | demo1234 | system_admin | ผศ. ดร. อนุชา บริหาร |

-- AI Exam Generator - Database Export
-- Generated: 2026-07-20
-- Schema is defined by migration files in supabase/migrations/
-- This file contains seed/demo data exported from the live database.

-- ============================================
-- Table: profiles (4 rows)
-- ============================================
INSERT INTO profiles (id, email, full_name, role, avatar_url, department, created_at) VALUES
  ('ff519d18-1c2b-4608-809f-3a84639fdfad', 'instructor@example.com', 'ดร. สมชาย ใจดี', 'instructor', NULL, 'เทคโนโลยีการศึกษา', '2026-07-20 14:42:17.249419+00'),
  ('472f946e-e248-414f-84c8-5150626f68fe', 'reviewer@example.com', 'ดร. สมหญิง รักงาน', 'reviewer', NULL, 'หลักสูตรและการสอน', '2026-07-20 14:42:17.686556+00'),
  ('21b0d132-53c0-40d2-8c0e-cff1cbbc1456', 'academic@example.com', 'รศ. ดร. วิชัย วิชาการ', 'academic_admin', NULL, 'สำนักงานวิชาการ', '2026-07-20 14:42:18.130201+00'),
  ('1904a2b1-6304-45b8-aee8-c15ff89eb0ed', 'admin@example.com', 'ผศ. ดร. อนุชา บริหาร', 'system_admin', NULL, 'สำนักงานวิชาการ', '2026-07-20 14:42:18.568512+00')
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- All other tables (courses, course_topics, learning_outcomes, documents,
-- generation_jobs, questions, question_reviews, exams, test_blueprints,
-- ai_usage_logs, audit_logs, notifications) have 0 rows in the live database.
-- ============================================

-- ============================================
-- Database Schema Summary (13 tables, all with RLS enabled)
-- ============================================
-- profiles          - User profiles with roles (instructor, reviewer, academic_admin, system_admin)
-- courses           - Course information with code, name (TH/EN), credits, level, faculty
-- course_topics     - Topics within a course with week numbers and sort order
-- learning_outcomes - PLO/CLO/LO outcomes linked to courses with Bloom levels
-- documents         - Uploaded course documents with extraction status
-- generation_jobs   - AI question generation job tracking
-- questions         - Question bank with choices, rubrics, Bloom levels, difficulty
-- question_reviews  - Review decisions on questions (approved/rejected/revision_requested)
-- exams             - Exam sets with question ordering and versions
-- test_blueprints   - Exam blueprints defining question distribution
-- ai_usage_logs     - AI API usage tracking (tokens, cost, latency)
-- audit_logs        - System audit trail
-- notifications     - User notifications
--
-- All tables use text primary keys (UUIDs or custom IDs).
-- All tables have RLS enabled with permissive policies for anon+authenticated.
-- No foreign key constraints are defined (references managed at app level).

-- Create 3 demo auth users with proper roles and matching profiles
-- Password for all: demo1234
-- Uses crypt() from pgcrypto (built-in in Supabase auth schema)

-- Clean up any existing entries first
DELETE FROM profiles WHERE email IN ('instructor@example.com', 'reviewer@example.com', 'admin@example.com');
DELETE FROM auth.users WHERE email IN ('instructor@example.com', 'reviewer@example.com', 'admin@example.com');
DELETE FROM auth.identities WHERE identity_data->>'email' IN ('instructor@example.com', 'reviewer@example.com', 'admin@example.com');

-- ============ Instructor ============
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'instructor@example.com',
  crypt('demo1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"ดร. สมชาย ใจดี","role":"instructor","department":"เทคโนโลยีการศึกษา","avatar_url":null}',
  now(), now(), ''
);

-- ============ Reviewer ============
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'reviewer@example.com',
  crypt('demo1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"ดร. สมหญิง รักงาน","role":"reviewer","department":"หลักสูตรและการสอน","avatar_url":null}',
  now(), now(), ''
);

-- ============ System Admin ============
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@example.com',
  crypt('demo1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"ผศ. ดร. อนุชา บริหาร","role":"system_admin","department":"สำนักงานวิชาการ","avatar_url":null}',
  now(), now(), ''
);

-- Insert matching profiles (id = auth.users id)
INSERT INTO profiles (id, email, full_name, role, department, avatar_url, created_at)
SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'role', raw_user_meta_data->>'department', null, created_at
FROM auth.users
WHERE email IN ('instructor@example.com', 'reviewer@example.com', 'admin@example.com');

-- ============ Academic Admin (4th role for completeness) ============
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'academic@example.com',
  crypt('demo1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"รศ. ดร. วิชัย วิชาการ","role":"academic_admin","department":"สำนักงานวิชาการ","avatar_url":null}',
  now(), now(), ''
);

INSERT INTO profiles (id, email, full_name, role, department, avatar_url, created_at)
SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'role', raw_user_meta_data->>'department', null, created_at
FROM auth.users
WHERE email = 'academic@example.com';

-- Fix: add missing auth.identities rows for demo users
-- provider_id must be unique per identity, use user id

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  now(), now(), now()
FROM auth.users
WHERE email IN ('instructor@example.com', 'reviewer@example.com', 'academic@example.com', 'admin@example.com')
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = auth.users.id);

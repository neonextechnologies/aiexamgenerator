-- Fix: GoTrue requires an instance row in auth.instances.
-- Our demo users reference instance_id 00000000-0000-0000-0000-000000000000 which doesn't exist,
-- causing "Database error querying schema" during sign-in.

INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  '{"hook":"http://localhost:8080/auth/v1/hooks","external_url":"http://localhost:8080/auth/v1","mailer":{"allow_unverified_email_sign_ins":false}}',
  now(), now()
)
ON CONFLICT (id) DO NOTHING;

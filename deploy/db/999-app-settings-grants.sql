-- Allow postgres role to set app.settings.* used by migrate runner / pg_cron wake.
-- Runs as supabase_admin during init (after roles exist).
GRANT SET ON PARAMETER app.settings.supabase_url TO postgres;
GRANT SET ON PARAMETER app.settings.service_role_key TO postgres;
GRANT SET ON PARAMETER app.settings.jwt_exp TO postgres;

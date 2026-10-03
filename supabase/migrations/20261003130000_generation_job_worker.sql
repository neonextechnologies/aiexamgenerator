/*
  Detached generation worker: claim/lock columns, claim RPC, optional pg_cron/pg_net wake.
*/

ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS worker_heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_queue
  ON generation_jobs (status, created_at)
  WHERE status IN ('queued', 'running');

-- Atomically claim queued (or stale running) jobs for a worker.
CREATE OR REPLACE FUNCTION claim_generation_jobs(
  p_limit integer DEFAULT 1,
  p_worker_id text DEFAULT 'worker',
  p_stale_seconds integer DEFAULT 900
)
RETURNS SETOF generation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_ids text[];
BEGIN
  WITH candidates AS (
    SELECT id
    FROM generation_jobs
    WHERE status = 'queued'
       OR (
         status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < now() - make_interval(secs => GREATEST(p_stale_seconds, 60))
         AND attempt_count < max_attempts
       )
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 1)
  ),
  updated AS (
    UPDATE generation_jobs g
    SET
      status = 'running',
      locked_at = now(),
      locked_by = p_worker_id,
      worker_heartbeat_at = now(),
      attempt_count = g.attempt_count + 1,
      started_at = COALESCE(g.started_at, now()),
      current_stage = COALESCE(g.current_stage, 'QUEUED'),
      stage_message = COALESCE(g.stage_message, 'worker claimed job'),
      progress_pct = COALESCE(g.progress_pct, 0)
    FROM candidates c
    WHERE g.id = c.id
    RETURNING g.id
  )
  SELECT array_agg(id) INTO claimed_ids FROM updated;

  RETURN QUERY
  SELECT *
  FROM generation_jobs
  WHERE claimed_ids IS NOT NULL AND id = ANY(claimed_ids)
  ORDER BY created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_generation_jobs(integer, text, integer) TO service_role, authenticated;

-- Optional cron wake via pg_net (enabled only when extensions + settings exist).
-- Owner must set app settings (or use Dashboard cron) — see .env.example.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net not available: %', SQLERRM;
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available: %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION wake_generation_workers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  service_key text;
  queued_count integer;
BEGIN
  SELECT count(*) INTO queued_count
  FROM generation_jobs
  WHERE status IN ('queued')
     OR (status = 'running' AND locked_at < now() - interval '15 minutes');

  IF queued_count = 0 THEN
    RETURN;
  END IF;

  base_url := NULLIF(current_setting('app.settings.supabase_url', true), '');
  service_key := NULLIF(current_setting('app.settings.service_role_key', true), '');

  IF base_url IS NULL THEN
    base_url := NULLIF(current_setting('supabase.url', true), '');
  END IF;

  IF base_url IS NULL OR service_key IS NULL THEN
    RAISE NOTICE 'wake_generation_workers skipped: set app.settings.supabase_url and app.settings.service_role_key (or schedule via Dashboard)';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := rtrim(base_url, '/') || '/functions/v1/process-generation-job',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key,
        'apikey', service_key
      ),
      body := jsonb_build_object('action', 'claim_and_process', 'limit', 3)
    );
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'net.http_post unavailable — configure Dashboard scheduled function instead';
  WHEN OTHERS THEN
    RAISE NOTICE 'wake_generation_workers http_post failed: %', SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION wake_generation_workers() TO service_role;

-- Schedule every minute when pg_cron exists (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'wake-generation-workers';

    PERFORM cron.schedule(
      'wake-generation-workers',
      '* * * * *',
      $$SELECT wake_generation_workers()$$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing — enqueue wake from client still works; schedule Dashboard cron if desired';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule wake-generation-workers: %', SQLERRM;
END $$;

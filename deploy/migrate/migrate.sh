#!/usr/bin/env bash
# Idempotent migration runner for Portainer GitOps re-deploys.
set -euo pipefail

PGHOST="${POSTGRES_HOST:-db}"
PGPORT="${POSTGRES_PORT:-5432}"
PGUSER="${POSTGRES_USER:-postgres}"
PGDATABASE="${POSTGRES_DB:-postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

KONG_INTERNAL_URL="${KONG_INTERNAL_URL:-http://kong:8000}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-}"
SEED_DEMO_USERS="${SEED_DEMO_USERS:-false}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

echo "[migrate] waiting for postgres at ${PGHOST}:${PGPORT}..."
for i in $(seq 1 60); do
  if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; then
    break
  fi
  sleep 2
  if [ "$i" -eq 60 ]; then
    echo "[migrate] postgres not ready" >&2
    exit 1
  fi
done

psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
CREATE TABLE IF NOT EXISTS public.aiexam_schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

shopt -s nullglob
mapfile -t files < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)
echo "[migrate] found ${#files[@]} migration file(s)"

for f in "${files[@]}"; do
  name="$(basename "$f")"
  applied="$(psql -At -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -c "SELECT 1 FROM public.aiexam_schema_migrations WHERE filename = '${name//\'/\'\'}' LIMIT 1")"
  if [ "$applied" = "1" ]; then
    echo "[migrate] skip $name"
    continue
  fi
  echo "[migrate] apply $name"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$f"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -c "INSERT INTO public.aiexam_schema_migrations(filename) VALUES ('${name//\'/\'\'}') ON CONFLICT DO NOTHING"
done

# Configure pg_cron wake URL against internal Kong (idempotent).
# Requires GRANT SET ON PARAMETER from deploy/db/999-app-settings-grants.sql (fresh volumes).
# Tolerate permission denied on already-initialized volumes without the grant.
if [ -n "$SERVICE_ROLE_KEY" ]; then
  echo "[migrate] configuring app.settings for generation worker wake"
  if ! psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -c "ALTER DATABASE ${PGDATABASE} SET app.settings.supabase_url = '${KONG_INTERNAL_URL}';" \
    -c "ALTER DATABASE ${PGDATABASE} SET app.settings.service_role_key = '${SERVICE_ROLE_KEY}';"; then
    echo "[migrate] WARN: could not ALTER DATABASE app.settings.* (permission denied?). Ensure deploy/db grants exist or set manually as supabase_admin." >&2
  fi
fi

# Optional seed: only when DB has no auth users and SEED_DEMO_USERS=true.
if [ "$SEED_DEMO_USERS" = "true" ] || [ "$SEED_DEMO_USERS" = "1" ]; then
  user_count="$(psql -At -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -c "SELECT count(*) FROM auth.users" 2>/dev/null || echo 0)"
  if [ "${user_count:-0}" = "0" ]; then
    echo "[migrate] applying seed.sql (empty auth.users)"
    if [ -f /seed.sql ]; then
      psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f /seed.sql || true
    fi
    if [ -n "$SERVICE_ROLE_KEY" ]; then
      echo "[migrate] waiting for edge functions then calling seed-demo-users"
      for i in $(seq 1 30); do
        if curl -fsS -o /dev/null -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
          -H "apikey: ${SERVICE_ROLE_KEY}" \
          "${KONG_INTERNAL_URL}/functions/v1/seed-demo-users" -X POST -H 'Content-Type: application/json' -d '{}' 2>/dev/null; then
          echo "[migrate] seed-demo-users ok"
          break
        fi
        sleep 3
      done
    fi
  else
    echo "[migrate] skip seed: auth.users already has ${user_count} row(s)"
  fi
else
  echo "[migrate] SEED_DEMO_USERS=${SEED_DEMO_USERS} — skipping demo seed"
fi

echo "[migrate] done"
exit 0

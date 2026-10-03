# Supabase Postgres with init SQL baked in (no relative bind mounts).
FROM supabase/postgres:17.6.1.136

COPY _supabase.sql /docker-entrypoint-initdb.d/migrations/97-_supabase.sql
COPY realtime.sql /docker-entrypoint-initdb.d/migrations/99-realtime.sql
COPY webhooks.sql /docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql
COPY roles.sql /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
COPY jwt.sql /docker-entrypoint-initdb.d/init-scripts/99-jwt.sql
COPY 999-app-settings-grants.sql /docker-entrypoint-initdb.d/init-scripts/999-app-settings-grants.sql

# Applies supabase/migrations/*.sql idempotently after db is healthy.
FROM postgres:17-alpine

RUN apk add --no-cache bash curl

COPY deploy/migrate/migrate.sh /migrate.sh
COPY supabase/migrations /migrations
COPY supabase/seed.sql /seed.sql

RUN chmod +x /migrate.sh

ENTRYPOINT ["/migrate.sh"]

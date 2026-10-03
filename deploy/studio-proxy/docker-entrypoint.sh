#!/bin/sh
set -eu

USER="${DASHBOARD_USERNAME:-supabase}"
PASS="${DASHBOARD_PASSWORD:-changeme}"
UPSTREAM="${STUDIO_UPSTREAM:-studio:3000}"

htpasswd -bc /etc/nginx/htpasswd "$USER" "$PASS" >/dev/null

export STUDIO_UPSTREAM="$UPSTREAM"
envsubst '${STUDIO_UPSTREAM}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'

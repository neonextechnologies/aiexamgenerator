# Edge runtime with app functions + official main dispatcher baked in.
# Functions import shared code via ../../../src/... from /home/deno/functions/<name>.
FROM supabase/edge-runtime:v1.76.2

COPY supabase/functions /home/deno/functions
COPY deploy/functions/main /home/deno/functions/main
COPY src /home/src

CMD ["start", "--user-worker-request-idle-timeout", "150000", "--main-service", "/home/deno/functions/main"]

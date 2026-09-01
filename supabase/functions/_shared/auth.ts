// Shared CORS + JWT gate for edge functions
function resolveCorsOrigin(req?: Request): string {
  const configured = Deno.env.get("ALLOWED_ORIGIN");
  if (configured) return configured;
  const origin = req?.headers.get("Origin") || "";
  if (
    origin.startsWith("http://127.0.0.1:") ||
    origin.startsWith("http://localhost:")
  ) {
    return origin;
  }
  return "http://127.0.0.1:5173";
}

export function corsHeaders(req?: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveCorsOrigin(req),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-seed-secret",
  };
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders(req) });
  }
  return null;
}

export function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Require a valid Supabase user JWT (rejects bare anon key for mutating functions). */
export async function requireUser(req: Request): Promise<{ userId: string; token: string } | Response> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse({ error: "Missing Authorization header" }, 401, req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });

  if (!resp.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401, req);
  }

  const user = await resp.json();
  if (!user?.id) return jsonResponse({ error: "Unauthorized" }, 401, req);
  return { userId: user.id as string, token };
}

/** Seed function: require service role key or SEED_SECRET. */
export function requireSeedSecret(req: Request): Response | null {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const seedSecret = Deno.env.get("SEED_SECRET") || "";
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = req.headers.get("x-seed-secret") || "";

  if (serviceRole && token === serviceRole) return null;
  if (seedSecret && (token === seedSecret || headerSecret === seedSecret)) return null;
  return jsonResponse({ error: "Forbidden: seed requires SEED_SECRET or service role key" }, 403, req);
}

import { supabase, isDemoMode } from './supabase';

export function getEdgeBase(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL is not configured');
  return `${url}/functions/v1`;
}

/** Prefer user JWT; fall back to anon key for unauthenticated bootstrap calls. */
export async function getEdgeHeaders(): Promise<Record<string, string>> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  let token = anon;
  if (!isDemoMode && supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) token = data.session.access_token;
  }
  if (!token) throw new Error('No auth token available for edge function call');
  return {
    Authorization: `Bearer ${token}`,
    apikey: anon || token,
    'Content-Type': 'application/json',
  };
}

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const resp = await fetch(`${getEdgeBase()}/${name}`, {
    method: 'POST',
    headers: await getEdgeHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as T;
  return { ok: resp.ok, status: resp.status, data };
}

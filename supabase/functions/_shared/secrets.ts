/**
 * Server-side provider secret helpers (Deno edge).
 * Uses PROVIDER_SECRETS_KEY with pgcrypto via RPC, AES-GCM as client-compatible fallback.
 */

function requireSecret(): string {
  const key = Deno.env.get('PROVIDER_SECRETS_KEY') || Deno.env.get('AI_PROVIDER_SECRETS_KEY') || '';
  if (!key.trim()) {
    throw new Error('PROVIDER_SECRETS_KEY is not set — required to encrypt stored API keys');
  }
  return key.trim();
}

export function hasProviderSecretsKey(): boolean {
  return Boolean((Deno.env.get('PROVIDER_SECRETS_KEY') || Deno.env.get('AI_PROVIDER_SECRETS_KEY') || '').trim());
}

/** Encrypt plaintext via Postgres pgcrypto when available; otherwise AES-GCM. */
export async function encryptProviderSecret(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  plaintext: string,
): Promise<{ ciphertext: string; mode: 'pgcrypto' | 'aes_gcm' }> {
  const secret = requireSecret();
  const { data, error } = await supabase.rpc('app_encrypt_secret', { plaintext, secret });
  if (!error && typeof data === 'string' && data.length > 0) {
    return { ciphertext: data, mode: 'pgcrypto' };
  }
  const ciphertext = await aesGcmEncrypt(plaintext, secret);
  return { ciphertext, mode: 'aes_gcm' };
}

export async function decryptProviderSecret(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  ciphertext: string | null | undefined,
  mode?: string | null,
): Promise<string> {
  if (!ciphertext) return '';
  // Legacy base64 (pre-encryption) — used only during migration.
  if (!mode || mode === 'legacy_base64') {
    try {
      return atob(ciphertext);
    } catch {
      // fall through
    }
  }
  const secret = Deno.env.get('PROVIDER_SECRETS_KEY') || Deno.env.get('AI_PROVIDER_SECRETS_KEY') || '';
  if (!secret) {
    // Fall back to env-only keys when vault secret is missing.
    try { return atob(ciphertext); } catch { return ''; }
  }
  if (mode === 'aes_gcm' || ciphertext.startsWith('aesgcm:')) {
    return aesGcmDecrypt(ciphertext.replace(/^aesgcm:/, ''), secret);
  }
  const { data, error } = await supabase.rpc('app_decrypt_secret', { ciphertext, secret });
  if (!error && typeof data === 'string') return data;
  try {
    return await aesGcmDecrypt(ciphertext.replace(/^aesgcm:/, ''), secret);
  } catch {
    try { return atob(ciphertext); } catch { return ''; }
  }
}

export function hintFromKey(key: string): string {
  if (!key || key.length < 4) return '••••';
  return `••••${key.slice(-4)}`;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function aesGcmEncrypt(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  let binary = '';
  packed.forEach(b => { binary += String.fromCharCode(b); });
  return `aesgcm:${btoa(binary)}`;
}

async function aesGcmDecrypt(payload: string, secret: string): Promise<string> {
  const raw = payload.startsWith('aesgcm:') ? payload.slice(7) : payload;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const key = await deriveAesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

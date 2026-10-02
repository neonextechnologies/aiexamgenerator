import { formatFromAddress, smtpUsesImplicitTls } from './smtp';

function decodeStoredSecret(encoded?: string | null): string {
  if (!encoded) return '';
  try {
    return atob(encoded);
  } catch {
    return '';
  }
}

export type EmailTransportKind = 'demo' | 'resend' | 'smtp';

export interface EmailProviderRow {
  id?: string;
  provider_type?: string | null;
  is_enabled?: boolean | null;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  encryption?: string | null;
  secret_ref?: string | null;
  encrypted_secret?: string | null;
}

export interface ResolvedEmail {
  kind: EmailTransportKind;
  from: string;
  fromName: string;
  replyTo?: string | null;
  resendApiKey?: string;
  message: string;
  smtp?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    implicitTls: boolean;
  };
}

const DEMO_MESSAGE = 'ไม่ได้ตั้งค่า Resend หรือ SMTP — ใช้โหมดสาธิต (ไม่ส่งอีเมลจริง)';

export function resolveEmailTransport(input: {
  env?: Record<string, string | undefined>;
  providers?: EmailProviderRow[] | null;
}): ResolvedEmail {
  const env = input.env || {};
  const rows = input.providers || [];
  const enabled = rows.find(row => row.is_enabled && row.provider_type && row.provider_type !== 'demo');
  const attempts: EmailProviderRow[] = [];

  if (enabled) attempts.push(enabled);
  if (env.RESEND_API_KEY && enabled?.provider_type !== 'resend') {
    attempts.push({
      provider_type: 'resend',
      is_enabled: true,
      secret_ref: 'RESEND_API_KEY',
      from_email: env.EMAIL_FROM,
      from_name: env.EMAIL_FROM_NAME,
    });
  }
  if (env.SMTP_HOST && enabled?.provider_type !== 'smtp') {
    attempts.push({
      provider_type: 'smtp',
      is_enabled: true,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
      username: env.SMTP_USER,
      from_email: env.SMTP_FROM || env.EMAIL_FROM,
      from_name: env.SMTP_FROM_NAME || env.EMAIL_FROM_NAME,
      secret_ref: 'SMTP_PASSWORD',
      encryption: env.SMTP_SECURE,
    });
  }

  let failure = DEMO_MESSAGE;
  for (const row of attempts) {
    const built = buildTransport(row, env);
    if (built.kind !== 'invalid') return built;
    failure = built.message;
  }

  return {
    kind: 'demo',
    from: 'AI Exam Generator <noreply@example.com>',
    fromName: 'AI Exam Generator',
    message: failure,
  };
}

export function readEmailEnv(get: (name: string) => string | undefined): Record<string, string | undefined> {
  const names = [
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'EMAIL_FROM_NAME',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'SMTP_FROM_NAME',
    'SMTP_SECURE',
  ];
  const env: Record<string, string | undefined> = {};
  for (const name of names) env[name] = get(name) || undefined;
  return env;
}

type BuiltTransport = ResolvedEmail | { kind: 'invalid'; message: string };

function buildTransport(row: EmailProviderRow, env: Record<string, string | undefined>): BuiltTransport {
  const type = row.provider_type;
  if (type === 'resend') return buildResend(row, env);
  if (type === 'smtp') return buildSmtp(row, env);
  return { kind: 'invalid', message: `ไม่รองรับผู้ให้บริการอีเมลประเภท ${type || '-'}` };
}

function buildResend(row: EmailProviderRow, env: Record<string, string | undefined>): BuiltTransport {
  const apiKey = secretValue(row, env, 'RESEND_API_KEY');
  const fromEmail = row.from_email || env.EMAIL_FROM || '';
  if (!apiKey) return { kind: 'invalid', message: 'เลือก Resend แล้ว แต่ไม่พบ RESEND_API_KEY' };
  if (!fromEmail.trim()) return { kind: 'invalid', message: 'ตั้งค่า RESEND_API_KEY แล้ว แต่ยังไม่มี EMAIL_FROM' };
  const fromName = row.from_name || env.EMAIL_FROM_NAME || 'AI Exam Generator';
  return {
    kind: 'resend',
    from: formatFromAddress(fromName, fromEmail),
    fromName,
    replyTo: row.reply_to,
    resendApiKey: apiKey,
    message: 'ใช้ Resend ในการส่งอีเมล',
  };
}

function buildSmtp(row: EmailProviderRow, env: Record<string, string | undefined>): BuiltTransport {
  const host = row.host || env.SMTP_HOST || '';
  const fromEmail = row.from_email || env.SMTP_FROM || env.EMAIL_FROM || '';
  if (!host.trim()) return { kind: 'invalid', message: 'เลือก SMTP แล้ว แต่ไม่พบ SMTP_HOST' };
  if (!fromEmail.trim()) return { kind: 'invalid', message: 'ตั้งค่า SMTP แล้ว แต่ยังไม่มี SMTP_FROM หรือ EMAIL_FROM' };
  const port = Number(row.port || env.SMTP_PORT || 587);
  const fromName = row.from_name || env.SMTP_FROM_NAME || env.EMAIL_FROM_NAME || 'AI Exam Generator';
  const secureFlag = row.encryption || env.SMTP_SECURE;
  return {
    kind: 'smtp',
    from: formatFromAddress(fromName, fromEmail),
    fromName,
    replyTo: row.reply_to,
    message: 'ใช้ SMTP ในการส่งอีเมล',
    smtp: {
      host: host.trim(),
      port: Number.isFinite(port) && port > 0 ? port : 587,
      username: row.username || env.SMTP_USER || undefined,
      password: secretValue(row, env, 'SMTP_PASSWORD') || undefined,
      implicitTls: smtpUsesImplicitTls(port, secureFlag),
    },
  };
}

function secretValue(row: EmailProviderRow, env: Record<string, string | undefined>, fallbackName: string): string {
  const stored = decodeStoredSecret(row.encrypted_secret);
  if (stored) return stored;
  const ref = (row.secret_ref || fallbackName).trim();
  return (env[ref] || env[fallbackName] || '').trim();
}

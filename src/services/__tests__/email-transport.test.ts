import { describe, expect, it } from 'vitest';
import { probeResend, sendWithResend } from '../email/resend';
import { resolveEmailTransport } from '../email/resolve';
import { buildRfc822, encodeMimeHeader, smtpSession, type SmtpConnection } from '../email/smtp';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function scripted(replies: string[]): SmtpConnection & { sent: string[] } {
  const sent: string[] = [];
  let index = 0;
  return {
    sent,
    async send(data: string) { sent.push(data); },
    async read() { return replies[index++] ?? '250 OK'; },
    async close() {},
  };
}

describe('Resend email transport', () => {
  it('posts the message to the Resend API', async () => {
    let payload: Record<string, unknown> = {};
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toBe('https://api.resend.com/emails');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
      payload = JSON.parse(String(init?.body));
      return jsonResponse(200, { id: 'email_123' });
    };

    const result = await sendWithResend('re_test', {
      from: 'AI Exam <noreply@example.com>',
      to: 'teacher@example.com',
      subject: 'สร้างข้อสอบเสร็จสิ้น',
      html: '<p>เสร็จแล้ว</p>',
      text: 'เสร็จแล้ว',
    }, fetchImpl);

    expect(result).toEqual({ ok: true, id: 'email_123', message: 'ส่งอีเมลผ่าน Resend แล้ว' });
    expect(payload.to).toEqual(['teacher@example.com']);
    expect(payload.subject).toBe('สร้างข้อสอบเสร็จสิ้น');
  });

  it('returns the provider error without throwing', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(422, { message: 'invalid from address' });
    const result = await sendWithResend('re_test', {
      from: 'bad',
      to: 'teacher@example.com',
      subject: 'หัวข้อ',
      html: '<p>x</p>',
    }, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('invalid from address');
  });

  it('probes Resend domains with the API key', async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toBe('https://api.resend.com/domains');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
      return jsonResponse(200, { data: [] });
    };
    await expect(probeResend('re_test', fetchImpl)).resolves.toMatchObject({ ok: true });
  });
});

describe('SMTP email transport', () => {
  it('authenticates and sends a message', async () => {
    const conn = scripted([
      '220 ready',
      '250 hello',
      '334 VXNlcm5hbWU6',
      '334 UGFzc3dvcmQ6',
      '235 authenticated',
      '250 sender ok',
      '250 recipient ok',
      '354 start',
      '250 queued',
      '221 bye',
    ]);
    await smtpSession(conn, {
      username: 'user',
      password: 'secret',
      from: 'AI Exam <noreply@example.com>',
      to: ['teacher@example.com'],
      rawMessage: 'Subject: hi\r\n\r\nbody',
    });
    expect(conn.sent[0]).toBe('EHLO aiexam\r\n');
    expect(conn.sent).toContain('AUTH LOGIN\r\n');
    expect(conn.sent).toContain('MAIL FROM:<noreply@example.com>\r\n');
    expect(conn.sent).toContain('RCPT TO:<teacher@example.com>\r\n');
    expect(conn.sent.some(line => line.startsWith('DATA'))).toBe(true);
    expect(conn.sent[conn.sent.length - 1]).toBe('QUIT\r\n');
  });

  it('upgrades with STARTTLS when the server advertises it', async () => {
    let upgraded = false;
    const conn = scripted([
      '220 ready',
      '250-STARTTLS\n250 OK',
      '220 tls go',
      '250 hello again',
      '221 bye',
    ]);
    conn.startTls = async () => { upgraded = true; };
    await smtpSession(conn, { implicitTls: false });
    expect(upgraded).toBe(true);
    expect(conn.sent).toContain('STARTTLS\r\n');
  });

  it('encodes non-ASCII subjects', () => {
    expect(encodeMimeHeader('สร้างข้อสอบ')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    const raw = buildRfc822({
      from: 'AI Exam <noreply@example.com>',
      to: ['teacher@example.com'],
      subject: 'Hello',
      html: '<p>สวัสดี</p>',
    });
    expect(raw).toContain('Subject: Hello');
    expect(raw).toContain('Content-Type: text/html; charset=UTF-8');
    expect(raw).toContain('<p>สวัสดี</p>');
  });
});

describe('email provider selection', () => {
  it('falls back to demo when nothing is configured', () => {
    const resolved = resolveEmailTransport({ env: {} });
    expect(resolved.kind).toBe('demo');
    expect(resolved.message).toContain('โหมดสาธิต');
  });

  it('selects Resend from env secrets', () => {
    const resolved = resolveEmailTransport({
      env: { RESEND_API_KEY: 're_test', EMAIL_FROM: 'noreply@example.com', EMAIL_FROM_NAME: 'AI Exam' },
    });
    expect(resolved.kind).toBe('resend');
    expect(resolved.resendApiKey).toBe('re_test');
    expect(resolved.from).toContain('noreply@example.com');
  });

  it('prefers an enabled email_providers row over other env transports', () => {
    const resolved = resolveEmailTransport({
      env: { RESEND_API_KEY: 're_test', EMAIL_FROM: 'noreply@example.com', SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'smtp@example.com' },
      providers: [{
        provider_type: 'smtp',
        is_enabled: true,
        host: 'mail.internal',
        port: 465,
        username: 'mailer',
        from_email: 'exams@example.com',
        from_name: 'ข้อสอบ',
        secret_ref: 'SMTP_PASSWORD',
        encryption: 'true',
      }],
    });
    expect(resolved.kind).toBe('smtp');
    expect(resolved.smtp).toMatchObject({ host: 'mail.internal', port: 465, username: 'mailer', implicitTls: true });
  });

  it('uses a stored secret before the environment variable', () => {
    const resolved = resolveEmailTransport({
      env: { RESEND_API_KEY: 'env-key', EMAIL_FROM: 'noreply@example.com' },
      providers: [{
        provider_type: 'resend',
        is_enabled: true,
        from_email: 'noreply@example.com',
        encrypted_secret: btoa('stored-key'),
        secret_ref: 'RESEND_API_KEY',
      }],
    });
    expect(resolved.resendApiKey).toBe('stored-key');
  });

  it('falls through to SMTP when the selected Resend row has no key', () => {
    const resolved = resolveEmailTransport({
      env: { SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'smtp@example.com', SMTP_PORT: '587' },
      providers: [{ provider_type: 'resend', is_enabled: true, from_email: 'noreply@example.com' }],
    });
    expect(resolved.kind).toBe('smtp');
    expect(resolved.smtp?.host).toBe('smtp.example.com');
    expect(resolved.smtp?.implicitTls).toBe(false);
  });
});

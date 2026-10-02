export interface SmtpConnection {
  send(data: string): Promise<void>;
  read(): Promise<string>;
  close(): Promise<void>;
  startTls?: () => Promise<void>;
}

export interface SmtpSessionOptions {
  implicitTls?: boolean;
  username?: string;
  password?: string;
  from?: string;
  to?: string[];
  rawMessage?: string;
}

export function smtpUsesImplicitTls(port: number, secureFlag?: string | null): boolean {
  if (secureFlag === 'true' || secureFlag === '1') return true;
  if (secureFlag === 'false' || secureFlag === '0') return false;
  return port === 465;
}

export function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

export function encodeMimeHeader(value: string): string {
  if (isAscii(value)) return value;
  return `=?UTF-8?B?${toBase64(value)}?=`;
}

function isAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 127) return false;
  }
  return true;
}

export function formatFromAddress(name: string | null | undefined, email: string): string {
  if (email.includes('<')) return email.trim();
  const trimmedName = name?.trim();
  if (!trimmedName) return email.trim();
  return `${encodeMimeHeader(trimmedName)} <${email.trim()}>`;
}

export function buildRfc822(input: { from: string; to: string[]; subject: string; html?: string; text?: string }): string {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to.join(', ')}`,
    `Subject: ${encodeMimeHeader(input.subject)}`,
    'MIME-Version: 1.0',
  ];
  if (input.text && input.html) {
    const boundary = `aiexam_${Math.random().toString(36).slice(2, 10)}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      input.text,
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      input.html,
      `--${boundary}--`,
      '',
    ].join('\r\n');
  }
  const html = Boolean(input.html);
  return [
    ...headers,
    `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=UTF-8`,
    '',
    input.html || input.text || '',
    '',
  ].join('\r\n');
}

export async function smtpSession(conn: SmtpConnection, opts: SmtpSessionOptions): Promise<void> {
  assertCode(await conn.read(), '220', 'greeting');
  await conn.send('EHLO aiexam\r\n');
  const ehlo = await conn.read();
  assertCode(ehlo, '250', 'ehlo');

  if (!opts.implicitTls && /STARTTLS/i.test(ehlo)) {
    if (!conn.startTls) throw new Error('SMTP ต้องใช้ STARTTLS แต่การเชื่อมต่อนี้ไม่รองรับ');
    await conn.send('STARTTLS\r\n');
    assertCode(await conn.read(), '220', 'starttls');
    await conn.startTls();
    await conn.send('EHLO aiexam\r\n');
    assertCode(await conn.read(), '250', 'ehlo-tls');
  }

  if (opts.username) {
    await conn.send('AUTH LOGIN\r\n');
    assertCode(await conn.read(), '334', 'auth');
    await conn.send(`${toBase64(opts.username)}\r\n`);
    assertCode(await conn.read(), '334', 'auth-user');
    await conn.send(`${toBase64(opts.password || '')}\r\n`);
    assertCode(await conn.read(), '235', 'auth-pass');
  }

  if (opts.rawMessage && opts.from && opts.to?.length) {
    await conn.send(`MAIL FROM:<${extractEmailAddress(opts.from)}>\r\n`);
    assertCode(await conn.read(), '250', 'mail-from');
    for (const recipient of opts.to) {
      await conn.send(`RCPT TO:<${extractEmailAddress(recipient)}>\r\n`);
      assertCode(await conn.read(), ['250', '251'], 'rcpt');
    }
    await conn.send('DATA\r\n');
    assertCode(await conn.read(), '354', 'data');
    await conn.send(`${dotStuff(opts.rawMessage)}\r\n.\r\n`);
    assertCode(await conn.read(), '250', 'body');
  }

  await conn.send('QUIT\r\n');
  try {
    await conn.read();
  } catch {
    // Some servers close immediately after QUIT.
  }
  await conn.close();
}

function assertCode(reply: string, expected: string | string[], step: string) {
  const code = reply.slice(0, 3);
  const ok = Array.isArray(expected) ? expected.includes(code) : code === expected;
  if (!ok) throw new Error(`SMTP ${step} failed: ${reply.trim()}`);
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function dotStuff(message: string): string {
  return message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

export interface ResendMessage {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendWithResend(
  apiKey: string,
  message: ResendMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; id?: string; message: string }> {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: message.from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: message.replyTo,
    }),
  });
  const raw = await response.text();
  const data = parseBody(raw);
  if (!response.ok) {
    return { ok: false, message: errorMessage(data, raw, response.status) };
  }
  return { ok: true, id: typeof data.id === 'string' ? data.id : undefined, message: 'ส่งอีเมลผ่าน Resend แล้ว' };
}

export async function probeResend(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  const response = await fetchImpl('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  await response.text().catch(() => '');
  if (response.ok) return { ok: true, message: 'เชื่อมต่อ Resend สำเร็จ' };
  return { ok: false, message: `Resend HTTP ${response.status}` };
}

function parseBody(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorMessage(data: Record<string, unknown>, raw: string, status: number): string {
  if (typeof data.message === 'string' && data.message) return data.message;
  const nested = data.error;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === 'string' && message) return message;
  }
  return raw.slice(0, 300) || `HTTP ${status}`;
}

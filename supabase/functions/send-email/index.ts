import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleOptions, jsonResponse, requireUser } from "../_shared/auth.ts";
import { readEmailEnv, resolveEmailTransport, type EmailProviderRow, type ResolvedEmail } from "../../../src/services/email/resolve.ts";
import { probeResend, sendWithResend } from "../../../src/services/email/resend.ts";
import { buildRfc822, smtpSession, type SmtpConnection } from "../../../src/services/email/smtp.ts";

Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "send");
    const resolved = await loadEmailConfig();

    if (action === "status") {
      return jsonResponse({
        ok: true,
        provider: resolved.kind,
        configured: resolved.kind !== "demo",
        from: resolved.kind === "demo" ? null : resolved.from,
        message: resolved.message,
      }, 200, req);
    }

    if (resolved.kind === "demo") {
      return jsonResponse({
        ok: true,
        demo: true,
        notConfigured: true,
        provider: "demo",
        message: resolved.message,
      }, 200, req);
    }

    if (action === "test") {
      const result = await testTransport(resolved);
      return jsonResponse({ ok: result.ok, provider: resolved.kind, message: result.message }, 200, req);
    }

    const to = normalizeRecipients(body.to);
    const subject = String(body.subject || "").trim();
    const html = String(body.html || "");
    const text = typeof body.text === "string" ? body.text : undefined;
    if (!to.length || !subject) {
      return jsonResponse({ ok: false, error: "ต้องระบุผู้รับและหัวข้อ" }, 400, req);
    }

    const result = await deliver(resolved, { to, subject, html, text });
    if (body.notificationId && result.ok) {
      await recordDelivery(String(body.notificationId), result.ok, result.message);
    } else if (body.notificationId) {
      await recordDelivery(String(body.notificationId), false, result.message);
    }
    return jsonResponse({
      ok: result.ok,
      provider: resolved.kind,
      id: result.id || null,
      message: result.message,
    }, result.ok ? 200 : 502, req);
  } catch (err) {
    return jsonResponse({ ok: false, error: (err as Error).message || "ส่งอีเมลไม่สำเร็จ" }, 500, req);
  }
});

async function loadEmailConfig(): Promise<ResolvedEmail> {
  const env = readEmailEnv((name) => Deno.env.get(name) || undefined);
  let providers: EmailProviderRow[] = [];
  const supabase = adminClient();
  if (supabase) {
    const { data } = await supabase.from("email_providers").select("*");
    providers = (data || []) as EmailProviderRow[];
  }
  return resolveEmailTransport({ env, providers });
}

async function testTransport(resolved: ResolvedEmail): Promise<{ ok: boolean; message: string }> {
  if (resolved.kind === "resend" && resolved.resendApiKey) return probeResend(resolved.resendApiKey);
  if (resolved.kind === "smtp" && resolved.smtp) {
    try {
      const conn = await openSmtp(resolved.smtp.host, resolved.smtp.port, resolved.smtp.implicitTls);
      await smtpSession(conn, {
        implicitTls: resolved.smtp.implicitTls,
        username: resolved.smtp.username,
        password: resolved.smtp.password,
      });
      return { ok: true, message: "เชื่อมต่อ SMTP สำเร็จ" };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "เชื่อมต่อ SMTP ไม่สำเร็จ" };
    }
  }
  return { ok: false, message: "ไม่ได้ตั้งค่าผู้ให้บริการอีเมล" };
}

async function deliver(
  resolved: ResolvedEmail,
  message: { to: string[]; subject: string; html: string; text?: string },
): Promise<{ ok: boolean; message: string; id?: string }> {
  if (resolved.kind === "resend" && resolved.resendApiKey) {
    return sendWithResend(resolved.resendApiKey, {
      from: resolved.from,
      to: message.to,
      subject: message.subject,
      html: message.html || `<p>${escapeHtml(message.text || "")}</p>`,
      text: message.text,
      replyTo: resolved.replyTo || undefined,
    });
  }
  if (resolved.kind === "smtp" && resolved.smtp) {
    const rawMessage = buildRfc822({
      from: resolved.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    const conn = await openSmtp(resolved.smtp.host, resolved.smtp.port, resolved.smtp.implicitTls);
    await smtpSession(conn, {
      implicitTls: resolved.smtp.implicitTls,
      username: resolved.smtp.username,
      password: resolved.smtp.password,
      from: resolved.from,
      to: message.to,
      rawMessage,
    });
    return { ok: true, message: "ส่งอีเมลผ่าน SMTP แล้ว" };
  }
  return { ok: false, message: "ไม่ได้ตั้งค่าผู้ให้บริการอีเมล" };
}

function adminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function recordDelivery(notificationId: string, ok: boolean, message: string) {
  const supabase = adminClient();
  if (!supabase) return;
  await supabase.from("notification_deliveries").insert({
    id: `nd-${crypto.randomUUID()}`,
    notification_id: notificationId,
    channel: "email",
    status: ok ? "sent" : "failed",
    error: ok ? null : message,
    delivered_at: ok ? new Date().toISOString() : null,
  });
}

function normalizeRecipients(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

async function openSmtp(host: string, port: number, implicitTls: boolean): Promise<SmtpConnection> {
  let conn = implicitTls
    ? await Deno.connectTls({ hostname: host, port })
    : await Deno.connect({ hostname: host, port });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  async function readLine(): Promise<string> {
    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        return line;
      }
      const chunk = new Uint8Array(1024);
      const read = await conn.read(chunk);
      if (read === null) throw new Error("SMTP connection closed");
      buffer += decoder.decode(chunk.subarray(0, read));
    }
  }

  return {
    async send(data: string) {
      const bytes = encoder.encode(data);
      let offset = 0;
      while (offset < bytes.length) {
        const wrote = await conn.write(bytes.subarray(offset));
        if (!wrote) break;
        offset += wrote;
      }
    },
    async read() {
      const lines: string[] = [];
      while (true) {
        const line = await readLine();
        lines.push(line);
        if (/^\d{3} /.test(line)) break;
      }
      return lines.join("\n");
    },
    async close() {
      try { conn.close(); } catch { /* already closed */ }
    },
    async startTls() {
      const upgraded = await Deno.startTls(conn, { hostname: host });
      conn = upgraded;
      buffer = "";
    },
  };
}

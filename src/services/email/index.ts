import { isDemoMode } from '../../lib/supabase';
import { invokeEdgeFunction } from '../../lib/edge';
import type { EmailProvider } from '../types';
import { demoEmailProvider } from './demo';

export { demoEmailProvider };

interface EmailEdgeResult {
  ok?: boolean;
  demo?: boolean;
  notConfigured?: boolean;
  message?: string;
  provider?: string;
}

export const edgeEmailProvider: EmailProvider = {
  async send(input) {
    try {
      const { ok, data } = await invokeEdgeFunction<EmailEdgeResult>('send-email', {
        action: 'send',
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      if (data?.demo || data?.notConfigured) return demoEmailProvider.send(input);
      if (!ok || data?.ok === false) return { ok: false };
      return { ok: true };
    } catch {
      return demoEmailProvider.send(input);
    }
  },
  async testConnection() {
    try {
      const { ok, data } = await invokeEdgeFunction<EmailEdgeResult>('send-email', { action: 'test' });
      if (data?.demo || data?.notConfigured) {
        return { ok: true, message: data.message || 'ไม่ได้ตั้งค่าอีเมล — ใช้โหมดสาธิต' };
      }
      return { ok: ok && data?.ok !== false, message: data?.message || (ok ? 'เชื่อมต่อสำเร็จ' : 'เชื่อมต่อไม่สำเร็จ') };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'เชื่อมต่อไม่สำเร็จ' };
    }
  },
};

export function getEmailProvider(): EmailProvider {
  return isDemoMode ? demoEmailProvider : edgeEmailProvider;
}

export async function getEmailStatus(): Promise<{ provider: string; message: string; configured: boolean }> {
  if (isDemoMode) {
    return { provider: 'demo', configured: false, message: 'โหมดสาธิต — ไม่ส่งอีเมลจริง' };
  }
  try {
    const { data } = await invokeEdgeFunction<EmailEdgeResult & { configured?: boolean }>('send-email', { action: 'status' });
    return {
      provider: data?.provider || 'demo',
      configured: Boolean(data?.configured),
      message: data?.message || 'ไม่ทราบสถานะผู้ให้บริการอีเมล',
    };
  } catch {
    return { provider: 'demo', configured: false, message: 'ไม่สามารถตรวจสอบผู้ให้บริการอีเมลได้' };
  }
}

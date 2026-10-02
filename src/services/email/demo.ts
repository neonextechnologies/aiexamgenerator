import type { EmailProvider } from '../types';

export const demoEmailProvider: EmailProvider = {
  async send(input) {
    console.info('[demo-email]', input.to, input.subject);
    return { ok: true };
  },
  async testConnection() {
    return { ok: true, message: 'โหมดสาธิต: บันทึกข้อความใน console เท่านั้น ไม่ได้ส่งอีเมลจริง' };
  },
};

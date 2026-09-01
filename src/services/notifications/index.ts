import type { EmailProvider, NotificationService } from '../types';
import { createNotification } from '../../lib/api';
import { isDemoMode, supabase } from '../../lib/supabase';

export const demoEmailProvider: EmailProvider = {
  async send(input) {
    console.info('[demo-email]', input.to, input.subject);
    return { ok: true };
  },
  async testConnection() {
    return { ok: true, message: 'Demo email provider logs only' };
  },
};

export const notificationService: NotificationService = {
  async notify(input) {
    await createNotification({
      id: `n-${Date.now()}`,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link || null,
      read: false,
      created_at: new Date().toISOString(),
    });
    // Optional email channel
    if (!isDemoMode && supabase) {
      const { data: prefs } = await supabase.from('notification_preferences').select('*').eq('user_id', input.userId).maybeSingle();
      if (prefs?.email_enabled) {
        const { data: tpl } = await supabase.from('email_templates').select('*').eq('code', input.type).eq('is_active', true).maybeSingle();
        if (tpl) {
          await demoEmailProvider.send({
            to: input.userId,
            subject: tpl.subject,
            html: tpl.body_html,
            text: tpl.body_text || undefined,
          });
        }
      }
    }
  },
};

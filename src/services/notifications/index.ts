import type { NotificationService } from '../types';
import { createNotification } from '../../lib/api';
import { isDemoMode, supabase } from '../../lib/supabase';
import { demoEmailProvider, getEmailProvider } from '../email';

export { demoEmailProvider };

export const notificationService: NotificationService = {
  async notify(input) {
    const created = await createNotification({
      id: `n-${Date.now()}`,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link || null,
      read: false,
      created_at: new Date().toISOString(),
    });
    if (isDemoMode || !supabase) return;

    const { data: prefs } = await supabase.from('notification_preferences').select('*').eq('user_id', input.userId).maybeSingle();
    if (!prefs?.email_enabled) return;

    const { data: tpl } = await supabase.from('email_templates').select('*').eq('code', input.type).eq('is_active', true).maybeSingle();
    if (!tpl) return;

    const { data: profile } = await supabase.from('profiles').select('email').eq('id', input.userId).maybeSingle();
    const to = profile?.email;
    if (!to) return;

    try {
      const provider = getEmailProvider();
      const result = await provider.send({
        to,
        subject: tpl.subject,
        html: tpl.body_html,
        text: tpl.body_text || undefined,
      });
      await supabase.from('notification_deliveries').insert({
        id: `nd-${Date.now()}`,
        notification_id: created.id,
        channel: 'email',
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : 'ส่งอีเมลไม่สำเร็จ',
        delivered_at: result.ok ? new Date().toISOString() : null,
      });
    } catch {
      // In-app notification is already stored. Email delivery is best-effort.
    }
  },
};

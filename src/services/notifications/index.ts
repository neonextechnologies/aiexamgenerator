import type { NotificationService } from '../types';
import { createNotification } from '../../lib/api';
import { isDemoMode, supabase } from '../../lib/supabase';
import { demoEmailProvider, getEmailProvider } from '../email';

export { demoEmailProvider };

export type NotificationPreferences = {
  user_id: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  categories: string[];
  digest_mode: boolean;
  updated_at: string;
};

const PREFS_STORAGE_PREFIX = 'aiexam.notification_prefs.';

function prefsStorageKey(userId: string) {
  return `${PREFS_STORAGE_PREFIX}${userId}`;
}

export function substituteTemplate(
  template: string,
  vars: Record<string, string | number | boolean | null | undefined>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value == null ? '' : String(value);
  });
}

function defaultPrefs(userId: string): NotificationPreferences {
  return {
    user_id: userId,
    in_app_enabled: true,
    email_enabled: false,
    categories: ['info', 'success', 'warning', 'error', 'critical'],
    digest_mode: false,
    updated_at: new Date().toISOString(),
  };
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  if (isDemoMode || !supabase) {
    try {
      const raw = localStorage.getItem(prefsStorageKey(userId));
      if (raw) return { ...defaultPrefs(userId), ...JSON.parse(raw) } as NotificationPreferences;
    } catch {
      // fall through
    }
    return defaultPrefs(userId);
  }
  const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return defaultPrefs(userId);
  return {
    user_id: data.user_id,
    in_app_enabled: data.in_app_enabled !== false,
    email_enabled: Boolean(data.email_enabled),
    categories: Array.isArray(data.categories) ? data.categories : defaultPrefs(userId).categories,
    digest_mode: Boolean(data.digest_mode),
    updated_at: data.updated_at || new Date().toISOString(),
  };
}

export async function saveNotificationPreferences(
  userId: string,
  patch: Partial<Pick<NotificationPreferences, 'email_enabled' | 'in_app_enabled' | 'categories' | 'digest_mode'>>,
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences(userId);
  const next: NotificationPreferences = {
    ...current,
    ...patch,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (isDemoMode || !supabase) {
    localStorage.setItem(prefsStorageKey(userId), JSON.stringify(next));
    return next;
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: userId,
      in_app_enabled: next.in_app_enabled,
      email_enabled: next.email_enabled,
      categories: next.categories,
      digest_mode: next.digest_mode,
      updated_at: next.updated_at,
    })
    .select('*')
    .single();
  if (error) throw error;
  return {
    user_id: data.user_id,
    in_app_enabled: data.in_app_enabled !== false,
    email_enabled: Boolean(data.email_enabled),
    categories: Array.isArray(data.categories) ? data.categories : next.categories,
    digest_mode: Boolean(data.digest_mode),
    updated_at: data.updated_at || next.updated_at,
  };
}

function buildTemplateVars(input: {
  title: string;
  message: string;
  type: string;
  link?: string;
  category?: string;
  count?: number | string;
  reason?: string;
}): Record<string, string | number | boolean | null | undefined> {
  return {
    title: input.title,
    message: input.message,
    type: input.type,
    link: input.link || '',
    category: input.category || '',
    count: input.count ?? '',
    reason: input.reason ?? input.message,
  };
}

export const notificationService: NotificationService = {
  async notify(input) {
    const prefs = await getNotificationPreferences(input.userId).catch(() => defaultPrefs(input.userId));
    const notificationId = `n-${Date.now()}`;

    if (prefs.in_app_enabled !== false) {
      await createNotification({
        id: notificationId,
        user_id: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link || null,
        read: false,
        created_at: new Date().toISOString(),
      });
    }

    if (!prefs.email_enabled) return;
    if (isDemoMode || !supabase) return;

    const { data: tpl } = await supabase.from('email_templates').select('*').eq('code', input.type).eq('is_active', true).maybeSingle();
    if (!tpl) return;

    const { data: profile } = await supabase.from('profiles').select('email').eq('id', input.userId).maybeSingle();
    const to = profile?.email;
    if (!to) return;

    const vars = buildTemplateVars({
      title: input.title,
      message: input.message,
      type: input.type,
      link: input.link,
      category: input.category,
      count: (input as { count?: number | string }).count,
      reason: (input as { reason?: string }).reason,
    });

    try {
      const provider = getEmailProvider();
      const result = await provider.send({
        to,
        subject: substituteTemplate(tpl.subject, vars),
        html: substituteTemplate(tpl.body_html, vars),
        text: tpl.body_text ? substituteTemplate(tpl.body_text, vars) : undefined,
      });
      await supabase.from('notification_deliveries').insert({
        id: `nd-${Date.now()}`,
        notification_id: notificationId,
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

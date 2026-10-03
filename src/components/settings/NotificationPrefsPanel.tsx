import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Card, Spinner } from '../ui';
import { useAuth } from '../../lib/auth';
import { isDemoMode } from '../../lib/supabase';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '../../services/notifications';

export function NotificationPrefsPanel() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getNotificationPreferences(user.id)
      .then(setPrefs)
      .catch(cause => setError(cause instanceof Error ? cause.message : 'โหลดการตั้งค่าไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const save = async () => {
    if (!user?.id || !prefs) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveNotificationPreferences(user.id, {
        email_enabled: prefs.email_enabled,
        in_app_enabled: prefs.in_app_enabled,
      });
      setPrefs(saved);
      setMessage(isDemoMode ? 'บันทึกแล้ว (โหมดสาธิต — localStorage)' : 'บันทึกการแจ้งเตือนเรียบร้อย');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!user) return <Card className="p-5"><p className="text-sm text-neutral-500">กรุณาเข้าสู่ระบบเพื่อตั้งค่าการแจ้งเตือน</p></Card>;
  if (!prefs) return <Card className="p-5"><p className="text-sm text-error-600">{error || 'ไม่พบการตั้งค่า'}</p></Card>;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-5 h-5 text-primary-600" />
        <h3 className="font-semibold">การแจ้งเตือน</h3>
      </div>
      <p className="text-sm text-neutral-500 mb-4">เลือกช่องทางที่ต้องการรับการแจ้งเตือนจากระบบ</p>
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100">
          <span className="text-sm text-neutral-700">แจ้งเตือนในแอป</span>
          <input
            type="checkbox"
            checked={prefs.in_app_enabled}
            onChange={e => setPrefs({ ...prefs, in_app_enabled: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100">
          <span className="text-sm text-neutral-700">แจ้งเตือนทางอีเมล</span>
          <input
            type="checkbox"
            checked={prefs.email_enabled}
            onChange={e => setPrefs({ ...prefs, email_enabled: e.target.checked })}
          />
        </label>
      </div>
      {message && <p className="text-sm text-success-600 mt-4">{message}</p>}
      {error && <p className="text-sm text-error-600 mt-4">{error}</p>}
      <div className="flex justify-end mt-4">
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>
          {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </button>
      </div>
    </Card>
  );
}

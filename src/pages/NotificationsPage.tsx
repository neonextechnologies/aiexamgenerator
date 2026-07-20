import { Bell, Check, CheckCheck } from 'lucide-react';
import { Card, PageHeader, EmptyState } from '../components/ui';
import { demoStore } from '../lib/demo-data';
import { formatRelativeTime } from '../lib/utils';
import { Link } from 'react-router-dom';

export default function NotificationsPage() {
  const notifications = [...demoStore.notifications].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <div>
      <PageHeader title="การแจ้งเตือน" description="การแจ้งเตือนทั้งหมด" actions={<button className="btn-secondary"><CheckCheck className="w-4 h-4" /> อ่านทั้งหมด</button>} />
      {notifications.length === 0 ? (
        <EmptyState icon={<Bell className="w-12 h-12" />} title="ไม่มีการแจ้งเตือน" />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Link key={n.id} to={n.link || '#'}><Card hover className="p-4">
              <div className="flex items-start gap-3">
                {!n.read && <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-neutral-900">{n.title}</p><p className="text-sm text-neutral-500 mt-0.5">{n.message}</p><p className="text-xs text-neutral-400 mt-1">{formatRelativeTime(n.created_at)}</p></div>
                {n.read && <Check className="w-4 h-4 text-neutral-300" />}
              </div>
            </Card></Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { type ReactNode } from 'react';
import { cn } from '../lib/utils';

export function Badge({ variant = 'neutral', children, className }: { variant?: 'primary'|'success'|'warning'|'error'|'neutral'|'accent'; children: ReactNode; className?: string }) {
  const v: Record<string, string> = { primary:'badge-primary', success:'badge-success', warning:'badge-warning', error:'badge-error', neutral:'badge-neutral', accent:'badge-accent' };
  return <span className={cn(v[variant], className)}>{children}</span>;
}

export function Card({ children, className, hover }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={cn(hover ? 'card-hover' : 'card', className)}>{children}</div>;
}

export function StatCard({ icon, label, value, sublabel, color = 'primary' }: { icon: ReactNode; label: string; value: string|number; sublabel?: string; color?: 'primary'|'success'|'warning'|'error'|'accent'|'neutral' }) {
  const cm: Record<string, string> = { primary:'bg-primary-50 text-primary-600', success:'bg-success-50 text-success-600', warning:'bg-warning-50 text-warning-600', error:'bg-error-50 text-error-600', accent:'bg-accent-50 text-accent-600', neutral:'bg-neutral-100 text-neutral-600' };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
          {sublabel && <p className="mt-1 text-xs text-neutral-400">{sublabel}</p>}
        </div>
        <div className={cn('rounded-lg p-3', cm[color])}>{icon}</div>
      </div>
    </Card>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 text-neutral-300">{icon}</div>}
      <h3 className="text-lg font-semibold text-neutral-700">{title}</h3>
      {description && <p className="mt-1 text-sm text-neutral-500 max-w-md">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'sm'|'md'|'lg'|'xl' }) {
  if (!open) return null;
  const sm: Record<string, string> = { sm:'max-w-md', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full bg-white rounded-xl shadow-lg animate-slide-up max-h-[90vh] overflow-hidden flex flex-col', sm[size])}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ size = 'md' }: { size?: 'sm'|'md'|'lg' }) {
  const sm: Record<string, string> = { sm:'w-4 h-4', md:'w-6 h-6', lg:'w-8 h-8' };
  return <div className={cn('animate-spin rounded-full border-2 border-neutral-200 border-t-primary-600', sm[size])} />;
}

export function ProgressBar({ value, max = 100, color = 'primary' }: { value: number; max?: number; color?: 'primary'|'success'|'warning'|'error'|'accent' }) {
  const pct = Math.min((value / max) * 100, 100);
  const cm: Record<string, string> = { primary:'bg-primary-500', success:'bg-success-500', warning:'bg-warning-500', error:'bg-error-500', accent:'bg-accent-500' };
  return <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden"><div className={cn('h-full rounded-full transition-all duration-300', cm[color])} style={{ width: `${pct}%` }} /></div>;
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)} className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap', active === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300')}>
          {tab.label}
          {tab.count !== undefined && <span className={cn('rounded-full px-2 py-0.5 text-xs', active === tab.id ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-500')}>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

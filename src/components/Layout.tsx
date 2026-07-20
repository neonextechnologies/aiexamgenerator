import { type ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Sparkles, Activity, Library, ClipboardCheck, FileCheck, BarChart3, Bell, Settings, LogOut, Menu, Brain, ChevronDown } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isDemoMode } from '../lib/supabase';
import { demoStore } from '../lib/demo-data';
import { cn } from '../lib/utils';
import { ROLE_LABELS } from '../types';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'แดชบอร์ด' },
  { to: '/courses', icon: BookOpen, label: 'รายวิชา' },
  { to: '/generate', icon: Sparkles, label: 'สร้างข้อสอบด้วย AI' },
  { to: '/generation-jobs', icon: Activity, label: 'งานสร้างข้อสอบ' },
  { to: '/question-bank', icon: Library, label: 'คลังข้อสอบ' },
  { to: '/review', icon: ClipboardCheck, label: 'คิวตรวจข้อสอบ' },
  { to: '/exams', icon: FileCheck, label: 'ชุดข้อสอบ' },
  { to: '/reports', icon: BarChart3, label: 'รายงาน' },
  { to: '/usage', icon: Activity, label: 'AI Usage' },
  { to: '/settings', icon: Settings, label: 'ตั้งค่า' },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const unreadCount = demoStore.notifications.filter(n => !n.read).length;

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-neutral-200">
        <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center"><Brain className="w-5 h-5 text-white" /></div>
        <div><h1 className="text-sm font-bold text-neutral-900">AI Exam Generator</h1><p className="text-xs text-neutral-500">ระบบสร้างข้อสอบด้วย AI</p></div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors', isActive ? 'bg-primary-50 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100')}>
            <item.icon size={18} />{item.label}
          </NavLink>
        ))}
      </nav>
      {isDemoMode && (
        <div className="mx-3 mb-3 px-3 py-2 rounded-lg bg-warning-50 border border-warning-200">
          <p className="text-xs font-medium text-warning-700">Demo AI Mode</p>
          <p className="text-xs text-warning-600 mt-0.5">ใช้ข้อมูลตัวอย่าง ไม่เรียก AI จริง</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      <aside className="w-64 bg-white border-r border-neutral-200 hidden lg:block fixed inset-y-0 left-0 z-30">{sidebar}</aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-neutral-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-lg animate-slide-up">{sidebar}</aside>
        </div>
      )}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-neutral-100"><Menu className="w-5 h-5 text-neutral-600" /></button>
          <div className="flex items-center gap-2 ml-auto">
            <NavLink to="/notifications" className="relative p-2 rounded-lg hover:bg-neutral-100">
              <Bell className="w-5 h-5 text-neutral-600" />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-error-500 text-white text-xs flex items-center justify-center">{unreadCount}</span>}
            </NavLink>
            <div className="relative">
              <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-100">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm font-semibold text-primary-700">{user?.full_name?.charAt(0) || 'U'}</div>
                <div className="hidden sm:block text-left"><p className="text-sm font-medium text-neutral-900">{user?.full_name}</p><p className="text-xs text-neutral-500">{user ? ROLE_LABELS[user.role] : ''}</p></div>
                <ChevronDown className="w-4 h-4 text-neutral-400" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 animate-fade-in">
                  <NavLink to="/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"><Settings className="w-4 h-4" /> ตั้งค่า</NavLink>
                  <button onClick={handleSignOut} className="flex items-center gap-2 px-3 py-2 text-sm text-error-600 hover:bg-error-50 w-full"><LogOut className="w-4 h-4" /> ออกจากระบบ</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Profile, UserRole } from '../types';
import { isDemoMode, supabase } from './supabase';
import { demoStore, DEMO_PROFILES } from './demo-data';

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const signIn = async (email: string, _password: string): Promise<{ error: string | null }> => {
    setLoading(true);
    try {
      if (isDemoMode || !supabase) {
        const profile = DEMO_PROFILES.find(p => p.email === email);
        if (profile) { setUser(profile); return { error: null }; }
        return { error: 'ไม่พบบัญชีที่ใช้อีเมลนี้' };
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: _password });
      if (error) return { error: error.message };
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, avatar_url, department, created_at')
          .eq('id', data.user.id)
          .single();
        setUser(profile ?? {
          id: data.user.id, email: data.user.email || '',
          full_name: data.user.user_metadata?.full_name || 'ผู้ใช้ใหม่',
          role: (data.user.user_metadata?.role as UserRole) || 'instructor',
          avatar_url: data.user.user_metadata?.avatar_url || null,
          department: data.user.user_metadata?.department || null,
          created_at: data.user.created_at || new Date().toISOString(),
        });
      }
      return { error: null };
    } finally { setLoading(false); }
  };

  const signUp = async (email: string, _password: string, fullName: string): Promise<{ error: string | null }> => {
    setLoading(true);
    try {
      if (isDemoMode || !supabase) {
        const newProfile: Profile = { id: `u-${Date.now()}`, email, full_name: fullName, role: 'instructor', department: null, created_at: new Date().toISOString() };
        demoStore.profiles.push(newProfile);
        setUser(newProfile);
        return { error: null };
      }
      const { data, error } = await supabase.auth.signUp({ email, password: _password, options: { data: { full_name: fullName, role: 'instructor' } } });
      if (error) return { error: error.message };
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email || '', full_name: fullName, role: 'instructor', avatar_url: null, department: null, created_at: data.user.created_at || new Date().toISOString() });
      }
      return { error: null };
    } finally { setLoading(false); }
  };

  const signOut = async () => {
    if (supabase && !isDemoMode) await supabase.auth.signOut();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

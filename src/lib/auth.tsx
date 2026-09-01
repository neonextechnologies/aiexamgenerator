import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Profile, UserRole } from '../types';
import { isDemoMode, supabase } from './supabase';
import { DEMO_PROFILES, demoStore } from './demo-data';

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string, fallback?: Partial<Profile>): Promise<Profile> {
  if (!supabase) {
    return {
      id: userId,
      email: fallback?.email || '',
      full_name: fallback?.full_name || 'ผู้ใช้ใหม่',
      role: (fallback?.role as UserRole) || 'instructor',
      avatar_url: fallback?.avatar_url ?? null,
      department: fallback?.department ?? null,
      created_at: fallback?.created_at || new Date().toISOString(),
    };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, avatar_url, department, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (profile) return profile as Profile;

  return {
    id: userId,
    email: fallback?.email || '',
    full_name: fallback?.full_name || 'ผู้ใช้ใหม่',
    role: (fallback?.role as UserRole) || 'instructor',
    avatar_url: fallback?.avatar_url ?? null,
    department: fallback?.department ?? null,
    created_at: fallback?.created_at || new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      if (isDemoMode || !supabase) {
        if (mounted) setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && mounted) {
        const profile = await fetchProfile(session.user.id, {
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name,
          role: session.user.user_metadata?.role,
          avatar_url: session.user.user_metadata?.avatar_url,
          department: session.user.user_metadata?.department,
          created_at: session.user.created_at,
        });
        if (mounted) setUser(profile);
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null);
          return;
        }
        const profile = await fetchProfile(session.user.id, {
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name,
          role: session.user.user_metadata?.role,
          avatar_url: session.user.user_metadata?.avatar_url,
          department: session.user.user_metadata?.department,
          created_at: session.user.created_at,
        });
        setUser(profile);
      });
      unsubscribe = () => subscription.unsubscribe();
      if (mounted) setLoading(false);
    };

    init();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const refreshProfile = async () => {
    if (!user || isDemoMode || !supabase) return;
    const profile = await fetchProfile(user.id, user);
    setUser(profile);
  };

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    setLoading(true);
    try {
      if (isDemoMode || !supabase) {
        const profile = DEMO_PROFILES.find(p => p.email === email);
        if (profile && (password === 'demo1234' || !password)) {
          setUser(profile);
          return { error: null };
        }
        if (profile && password !== 'demo1234') return { error: 'รหัสผ่านไม่ถูกต้อง' };
        return { error: 'ไม่พบบัญชีที่ใช้อีเมลนี้' };
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        const profile = await fetchProfile(data.user.id, {
          email: data.user.email || '',
          full_name: data.user.user_metadata?.full_name,
          role: data.user.user_metadata?.role,
          avatar_url: data.user.user_metadata?.avatar_url,
          department: data.user.user_metadata?.department,
          created_at: data.user.created_at,
        });
        setUser(profile);
      }
      return { error: null };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string): Promise<{ error: string | null }> => {
    setLoading(true);
    try {
      if (isDemoMode || !supabase) {
        const newProfile: Profile = {
          id: `u-${Date.now()}`,
          email,
          full_name: fullName,
          role: 'instructor',
          department: null,
          created_at: new Date().toISOString(),
        };
        demoStore.profiles.push(newProfile);
        setUser(newProfile);
        return { error: null };
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'instructor' } },
      });
      if (error) return { error: error.message };
      if (data.user) {
        // Trigger may create profile; upsert as fallback
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role: 'instructor',
          department: null,
        }, { onConflict: 'id' });
        setUser({
          id: data.user.id,
          email,
          full_name: fullName,
          role: 'instructor',
          avatar_url: null,
          department: null,
          created_at: data.user.created_at || new Date().toISOString(),
        });
      }
      return { error: null };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    if (supabase && !isDemoMode) await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useRequireRole(roles: UserRole[]) {
  const { user } = useAuth();
  return !!user && roles.includes(user.role);
}

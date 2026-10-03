import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isDemoMode } from '../lib/supabase';
import { Spinner } from '../components/ui';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await signIn(email.trim(), password);
      if (signInError) {
        setError(signInError);
        return;
      }
      navigate('/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = (em: string) => {
    setEmail(em);
    setPassword('demo1234');
    setError(null);
  };

  const busy = submitting;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary-600 mb-4"><Brain className="w-7 h-7 text-white" /></div>
          <h1 className="text-2xl font-bold text-neutral-900">AI Exam Generator</h1>
          <p className="text-sm text-neutral-500 mt-1">ระบบสร้างและบริหารข้อสอบด้วยปัญญาประดิษฐ์</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">เข้าสู่ระบบ</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">อีเมล</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder={isDemoMode ? 'instructor@example.com' : 'you@example.com'}
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">รหัสผ่าน</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            {error && <p className="text-sm text-error-600 bg-error-50 px-3 py-2 rounded-lg" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner size="sm" /> : <>เข้าสู่ระบบ <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
          {isDemoMode && (
            <div className="mt-6 pt-4 border-t border-neutral-200">
              <p className="text-xs text-neutral-500 mb-2 text-center">บัญชีตัวอย่าง (โหมดสาธิต — คลิกเพื่อกรอกอัตโนมัติ)</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => quickLogin('instructor@example.com')} className="btn-secondary text-xs py-1.5">อาจารย์</button>
                <button type="button" onClick={() => quickLogin('reviewer@example.com')} className="btn-secondary text-xs py-1.5">ผู้ตรวจ</button>
                <button type="button" onClick={() => quickLogin('academic@example.com')} className="btn-secondary text-xs py-1.5">ผู้ดูแลวิชาการ</button>
                <button type="button" onClick={() => quickLogin('admin@example.com')} className="btn-secondary text-xs py-1.5">ผู้ดูแลระบบ</button>
              </div>
            </div>
          )}
          {isDemoMode ? (
            <p className="text-center text-sm text-neutral-500 mt-4">
              ยังไม่มีบัญชี? <Link to="/register" className="text-primary-600 font-medium hover:underline">สมัครสมาชิก</Link>
            </p>
          ) : (
            <p className="text-center text-sm text-neutral-500 mt-4">
              ต้องการบัญชีใหม่? <Link to="/register" className="text-primary-600 font-medium hover:underline">ติดต่อผู้ดูแล / สมัครสมาชิก</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

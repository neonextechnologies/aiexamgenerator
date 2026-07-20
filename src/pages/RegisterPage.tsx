import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Spinner } from '../components/ui';

export default function RegisterPage() {
  const { signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    const { error } = await signUp(email, password, fullName);
    if (error) setError(error);
    else navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary-600 mb-4"><Brain className="w-7 h-7 text-white" /></div>
          <h1 className="text-2xl font-bold text-neutral-900">AI Exam Generator</h1>
          <p className="text-sm text-neutral-500 mt-1">ระบบสร้างและบริหารข้อสอบด้วยปัญญาประดิษฐ์</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">สมัครสมาชิก</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">ชื่อ-นามสกุล</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input value={fullName} onChange={e => setFullName(e.target.value)} className="input pl-10" placeholder="ดร. สมชาย ใจดี" required />
              </div>
            </div>
            <div>
              <label className="label">อีเมล</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input pl-10" placeholder="you@example.com" required />
              </div>
            </div>
            <div>
              <label className="label">รหัสผ่าน</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input pl-10" placeholder="อย่างน้อย 6 ตัวอักษร" required />
              </div>
            </div>
            {error && <p className="text-sm text-error-600 bg-error-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? <Spinner size="sm" /> : <>สมัครสมาชิก <ArrowRight className="w-4 h-4" /></>}</button>
          </form>
          <p className="text-center text-sm text-neutral-500 mt-4">มีบัญชีแล้ว? <Link to="/login" className="text-primary-600 font-medium hover:underline">เข้าสู่ระบบ</Link></p>
        </div>
      </div>
    </div>
  );
}

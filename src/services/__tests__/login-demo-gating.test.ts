import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mapAuthError } from '../../lib/auth-errors';

const root = resolve(import.meta.dirname, '../../..');

describe('mapAuthError', () => {
  it('maps signup_disabled to Thai contact-admin message', () => {
    expect(mapAuthError({ code: 'signup_disabled', message: 'Signups not allowed for this instance' }))
      .toBe('ปิดรับสมัครสมาชิกชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
    expect(mapAuthError('Signups not allowed for this instance'))
      .toBe('ปิดรับสมัครสมาชิกชั่วคราว กรุณาติดต่อผู้ดูแลระบบ');
  });

  it('maps invalid credentials to Thai', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' }))
      .toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    expect(mapAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  });

  it('maps email not confirmed and network errors', () => {
    expect(mapAuthError({ message: 'Email not confirmed' }))
      .toBe('กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');
    expect(mapAuthError({ message: 'Failed to fetch' }))
      .toBe('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
  });
});

describe('login page demo gating', () => {
  const loginSrc = readFileSync(resolve(root, 'src/pages/LoginPage.tsx'), 'utf8');
  const authSrc = readFileSync(resolve(root, 'src/lib/auth.tsx'), 'utf8');

  it('shows demo quick-login only when isDemoMode', () => {
    expect(loginSrc).toMatch(/isDemoMode\s*&&\s*\(/);
    expect(loginSrc).toMatch(/admin@example\.com/);
    expect(loginSrc).toMatch(/\{isDemoMode\s*&&/);
    // quick-login block must be gated
    const demoBlock = loginSrc.match(/\{isDemoMode\s*&&\s*\([\s\S]*?admin@example\.com[\s\S]*?\)\}/);
    expect(demoBlock).toBeTruthy();
  });

  it('real-mode signIn maps auth errors via mapAuthError and does not flip global loading', () => {
    expect(authSrc).toMatch(/mapAuthError\(error\)/);
    expect(authSrc).toMatch(/signInWithPassword/);
    // Avoid PublicRoute unmounting the form mid-submit
    expect(authSrc).not.toMatch(/const signIn[\s\S]*?setLoading\(true\)/);
  });
});

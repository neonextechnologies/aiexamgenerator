/** Map Supabase Auth / GoTrue error messages to Thai UI copy. */
export function mapAuthError(error: { message?: string; code?: string; status?: number } | string | null | undefined): string {
  if (!error) return 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  const raw = typeof error === 'string' ? error : (error.message || '');
  const code = typeof error === 'string' ? '' : (error.code || '');
  const lower = raw.toLowerCase();
  const codeLower = code.toLowerCase();

  if (
    codeLower === 'signup_disabled'
    || lower.includes('signup_disabled')
    || lower.includes('signups not allowed')
    || lower.includes('sign up is disabled')
    || lower.includes('signup is disabled')
  ) {
    return 'ปิดรับสมัครสมาชิกชั่วคราว กรุณาติดต่อผู้ดูแลระบบ';
  }

  if (
    codeLower === 'invalid_credentials'
    || lower.includes('invalid login credentials')
    || lower.includes('invalid credentials')
    || lower.includes('invalid email or password')
  ) {
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  }

  if (lower.includes('email not confirmed') || codeLower === 'email_not_confirmed') {
    return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
  }

  if (lower.includes('user already registered') || codeLower === 'user_already_exists') {
    return 'อีเมลนี้ถูกใช้สมัครแล้ว กรุณาเข้าสู่ระบบ';
  }

  if (lower.includes('password') && (lower.includes('at least') || lower.includes('weak') || lower.includes('short'))) {
    return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  }

  if (lower.includes('rate limit') || lower.includes('too many requests') || codeLower === 'over_request_rate_limit') {
    return 'พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
  }

  if (lower.includes('network') || lower.includes('fetch failed') || lower.includes('failed to fetch')) {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่';
  }

  // Already Thai or unknown — return as-is if non-empty
  return raw || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

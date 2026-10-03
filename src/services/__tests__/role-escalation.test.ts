import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

describe('role escalation hardening', () => {
  const migration = readFileSync(
    resolve(root, 'supabase/migrations/20261003150000_fix_role_escalation.sql'),
    'utf8',
  );
  const authSrc = readFileSync(resolve(root, 'src/lib/auth.tsx'), 'utf8');

  it('handle_new_user always inserts instructor and ignores metadata role', () => {
    expect(migration).toMatch(/VALUES\s*\([\s\S]*?'instructor'[\s\S]*?NEW\.raw_user_meta_data->>'department'/);
    expect(migration).not.toMatch(/raw_user_meta_data->>'role'/);
    expect(migration).toMatch(/ON CONFLICT \(id\) DO UPDATE SET/);
    expect(migration).not.toMatch(/role\s*=\s*COALESCE\(EXCLUDED\.role/);
    expect(migration).not.toMatch(/role\s*=\s*EXCLUDED\.role/);
  });

  it('current_user_role never reads user_metadata JWT claim', () => {
    const fnBody = migration.match(
      /CREATE OR REPLACE FUNCTION public\.current_user_role\(\)[\s\S]*?\$\$;/,
    )?.[0] ?? '';
    expect(fnBody).toMatch(/FROM public\.profiles WHERE id = auth\.uid/);
    expect(fnBody).toMatch(/app_metadata/);
    expect(fnBody).not.toMatch(/user_metadata/);
  });

  it('protect_profile_role trigger blocks escalation paths', () => {
    expect(migration).toMatch(/protect_profile_role/);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE ON public\.profiles/);
    expect(migration).toMatch(/service_role/);
    expect(migration).toMatch(/academic_admin/);
    expect(migration).toMatch(/NEW\.role := OLD\.role/);
    expect(migration).toMatch(/NEW\.role := 'instructor'/);
  });

  it('frontend signup does not send or trust metadata role', () => {
    expect(authSrc).not.toMatch(/user_metadata\?\.role/);
    expect(authSrc).toMatch(/options:\s*\{\s*data:\s*\{\s*full_name:\s*fullName\s*\}\s*\}/);
    expect(authSrc).not.toMatch(/options:\s*\{\s*data:\s*\{[^}]*\brole\b/);
    const upsertBlock = authSrc.match(/\.upsert\(\{[\s\S]*?\}, \{ onConflict: 'id' \}\)/)?.[0] ?? '';
    expect(upsertBlock).toContain('full_name');
    expect(upsertBlock).not.toMatch(/\brole\b/);
  });
});

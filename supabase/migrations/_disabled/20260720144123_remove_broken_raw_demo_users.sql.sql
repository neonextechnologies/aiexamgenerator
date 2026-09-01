-- Remove the raw-inserted demo users that are blocking GoTrue's normal operation.
-- They were inserted directly into auth.users/auth.identities without going through
-- GoTrue's Admin API, leaving internal state inconsistent ("Database error checking email").
-- The seed-demo-users edge function will recreate them properly via auth.admin.createUser.

DELETE FROM profiles WHERE email IN (
  'instructor@example.com',
  'reviewer@example.com',
  'academic@example.com',
  'admin@example.com'
);

-- identities cascade-delete with users via FK, but delete explicitly to be safe
DELETE FROM auth.identities
WHERE user_id IN (SELECT id FROM auth.users WHERE email IN (
  'instructor@example.com',
  'reviewer@example.com',
  'academic@example.com',
  'admin@example.com'
));

DELETE FROM auth.users WHERE email IN (
  'instructor@example.com',
  'reviewer@example.com',
  'academic@example.com',
  'admin@example.com'
);

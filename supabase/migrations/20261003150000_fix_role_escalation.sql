/*
  Fix privilege escalation:
  1) Signup trigger always assigns instructor (ignore user_metadata.role)
  2) Protect profiles.role on INSERT/UPDATE (service_role / system_admin /
     academic_admin with restricted grants)
  3) current_user_role() reads profiles only (optional app_metadata; never user_metadata)

  Idempotent. Does not alter existing profile rows (e.g. info@neonex.co.th stays admin).
*/

-- Prefer profiles; never trust user_editable user_metadata.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()::text),
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    'instructor'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() = 'system_admin';
$$;

-- Signup: always instructor; never copy role from raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, department, avatar_url)
  VALUES (
    NEW.id::text,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    'instructor',
    NEW.raw_user_meta_data->>'department',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    -- Never escalate/overwrite role from signup metadata.
    department = COALESCE(EXCLUDED.department, profiles.department),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Guard role column on client INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := COALESCE(auth.jwt() ->> 'role', '');
  actor_role text;
  allowed text[] := ARRAY['instructor', 'reviewer', 'academic_admin', 'system_admin'];
BEGIN
  IF NEW.role IS NULL OR NEW.role = '' THEN
    NEW.role := COALESCE(OLD.role, 'instructor');
  END IF;

  IF NOT (NEW.role = ANY (allowed)) THEN
    RAISE EXCEPTION 'invalid profile role: %', NEW.role;
  END IF;

  -- service_role (edge functions / migrate) may set any role
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF public.is_system_admin() THEN
      RETURN NEW;
    END IF;
    IF public.is_admin() AND NEW.role <> 'system_admin' THEN
      -- academic_admin may create non-system_admin profiles
      RETURN NEW;
    END IF;
    NEW.role := 'instructor';
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  actor_role := public.current_user_role();

  IF actor_role = 'system_admin' THEN
    RETURN NEW;
  END IF;

  IF actor_role = 'academic_admin' AND NEW.role <> 'system_admin' THEN
    RETURN NEW;
  END IF;

  -- Non-privileged (or academic_admin trying to grant system_admin): keep old role
  NEW.role := OLD.role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

COMMENT ON FUNCTION public.protect_profile_role() IS
  'Prevents privilege escalation via profiles.role; signup metadata and self-updates cannot become system_admin.';

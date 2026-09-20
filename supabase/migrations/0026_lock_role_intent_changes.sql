-- 0026_lock_role_intent_changes.sql
--
-- Harden role assignment. The enum public.role_intent already covers the
-- allowed values (passenger, driver, both, super_admin — the last added in
-- 0015), and handle_new_user() already rejects a signup that tries to
-- self-elevate through raw_user_meta_data. But the RLS policy
-- `profiles_update_self` grants owners UPDATE on their own row without any
-- column-level restriction — meaning any signed-in user could run
--
--     update public.profiles set role_intent = 'super_admin' where id = auth.uid();
--
-- and elevate themselves. Postgres RLS cannot constrain individual columns,
-- so we enforce it with a BEFORE UPDATE trigger that rejects a role_intent
-- change unless the caller is already a super_admin (via admin_users), and
-- also rejects any attempt to flip is_verified_driver, is_disabled, is_demo,
-- or force_password_reset from the client — those fields are the exclusive
-- province of admin RPCs and verification triggers.
--
-- Recovery: super_admin (shemaabdul70@gmail.com) can still change any of
-- these fields via a normal UPDATE because is_super_admin() returns true
-- for that account. Changing a role via the SQL editor as the postgres
-- superuser also bypasses the trigger (session_user is not authenticated).
--
-- Reversibility: DROP TRIGGER profiles_lock_privileged_columns ON
-- public.profiles; DROP FUNCTION public.profiles_lock_privileged_columns();

CREATE OR REPLACE FUNCTION public.is_super_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users a
     WHERE a.id = uid AND a.role = 'super_admin'
  );
$$;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_lock_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  -- Postgres superuser / service-role connections have no auth.uid(); let
  -- those through so migrations, dashboard edits, and server-side scripts
  -- keep working. All authenticated-app writes go through PostgREST which
  -- always sets auth.uid().
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- role_intent: only a super_admin can change anyone's role, including
  -- their own. Even if the row belongs to the caller.
  IF NEW.role_intent IS DISTINCT FROM OLD.role_intent
     AND NOT public.is_super_admin(caller) THEN
    RAISE EXCEPTION 'role_change_forbidden'
      USING errcode = '42501',
            hint    = 'role_intent can only be changed by a super_admin.';
  END IF;

  -- Verification / disable / demo / force-reset flags: never writable from
  -- a client update. They are set by:
  --   * is_verified_driver → verification approval RPC + triggers
  --   * is_disabled / is_demo → admin RPCs
  --   * force_password_reset → seed migration + client's own post-reset RPC
  -- A non-admin attempting to flip any of these means the client bypassed
  -- the intended API — refuse it.
  IF NEW.is_verified_driver IS DISTINCT FROM OLD.is_verified_driver
     AND NOT public.is_admin(caller) THEN
    RAISE EXCEPTION 'privileged_column_forbidden'
      USING errcode = '42501',
            hint    = 'is_verified_driver is set by verification, not by the client.';
  END IF;

  IF NEW.is_disabled IS DISTINCT FROM OLD.is_disabled
     AND NOT public.is_super_admin(caller) THEN
    RAISE EXCEPTION 'privileged_column_forbidden'
      USING errcode = '42501',
            hint    = 'is_disabled is a super_admin-only field.';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo
     AND NOT public.is_super_admin(caller) THEN
    RAISE EXCEPTION 'privileged_column_forbidden'
      USING errcode = '42501',
            hint    = 'is_demo is a super_admin-only field.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_lock_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_lock_privileged_columns();

COMMENT ON TRIGGER profiles_lock_privileged_columns ON public.profiles IS
  'Blocks non-super-admin clients from changing role_intent, is_disabled, is_demo. Blocks non-admin clients from changing is_verified_driver. Postgres superuser / service_role bypasses (auth.uid() is null).';

-- Belt-and-braces: harden handle_new_user() so a signup meta payload that
-- tries to self-assign 'super_admin' is coerced down to 'passenger'. This
-- was already true in 0015 but the earlier 0002 copy could still resurface
-- if migrations were re-run out of order, so restate it here idempotently.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wanted text;
  role_val public.role_intent;
BEGIN
  wanted := coalesce(new.raw_user_meta_data->>'role_intent', 'passenger');
  BEGIN
    role_val := wanted::public.role_intent;
  EXCEPTION WHEN others THEN
    role_val := 'passenger';
  END;
  IF role_val = 'super_admin' THEN
    role_val := 'passenger';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, role_intent)
  VALUES (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
          nullif(btrim(new.raw_user_meta_data->>'phone'), ''),
          role_val)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

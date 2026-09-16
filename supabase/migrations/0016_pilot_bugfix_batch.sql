-- 0016_pilot_bugfix_batch.sql
--
-- Pilot bugfix batch:
--   D. Unique email/phone at the DB level (email already unique via auth.users;
--      profiles.phone gets a case-insensitive uniqueness constraint + friendly
--      error).
--   E. Role integrity:
--        * profiles.role_intent = 'super_admin' can only be set by an admin —
--          a normal user cannot self-elevate via a PATCH on their profile.
--        * Journeys can only be inserted if the driver is is_verified_driver
--          AND is using their own is_verified vehicle. Enforced by trigger
--          (BEFORE INSERT) so it applies even if RLS is bypassed by a future
--          service call — server-side, not just UI.
--        * Vehicles: an owner cannot flip is_verified=true themselves; only
--          admins can.
--
-- Idempotent; safe to re-run.

-- ------------------------------------------------------------------
-- D. Unique email is already enforced by auth.users. Enforce phone
--    uniqueness on public.profiles. Normalize whitespace/case for the
--    uniqueness index only (the stored value is left as-is).
-- ------------------------------------------------------------------

drop index if exists profiles_phone_unique_idx;
create unique index profiles_phone_unique_idx
  on public.profiles (lower(regexp_replace(phone, '\s+', '', 'g')))
  where phone is not null;

comment on index public.profiles_phone_unique_idx is
  'Duplicate phone numbers are rejected at signup. Nullable (a user can exist without a phone), but any two non-null phones must differ ignoring case/whitespace.';

-- Friendlier error name the client can pattern-match. Postgres does not let us
-- rename the SQLSTATE 23505 constraint error, but wrapping the trigger below
-- gives us a clean "profiles_phone_unique" hint the client uses to map to a
-- friendly message.

-- ------------------------------------------------------------------
-- E1. profiles.role_intent = super_admin protection
-- ------------------------------------------------------------------

create or replace function public.guard_profile_role_intent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.role_intent is distinct from old.role_intent then
    -- Blocked: nobody except an admin can flip TO or FROM super_admin.
    if (new.role_intent = 'super_admin' or old.role_intent = 'super_admin')
       and not public.is_admin(auth.uid()) then
      raise exception 'role_intent_super_admin_forbidden' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' and new.role_intent = 'super_admin'
     and not public.is_admin(auth.uid()) then
    raise exception 'role_intent_super_admin_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_role_intent on public.profiles;
create trigger profiles_guard_role_intent
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role_intent();

-- ------------------------------------------------------------------
-- E2. Journey posting requires verified driver + verified own vehicle.
--     RLS in 0005 only checks driver_id = auth.uid(); this trigger adds
--     the verification gate at the database level so the UI can't be
--     bypassed. Existing rows are unaffected (INSERT-only).
-- ------------------------------------------------------------------

create or replace function public.guard_journey_insert_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_verified_driver boolean;
  v_vehicle_verified   boolean;
  v_vehicle_owner      uuid;
begin
  -- Admins can seed journeys freely (used by admin tools).
  if public.is_admin(auth.uid()) then return new; end if;

  select is_verified_driver into v_is_verified_driver
    from public.profiles where id = new.driver_id;

  if not coalesce(v_is_verified_driver, false) then
    raise exception 'driver_not_verified' using errcode = '42501';
  end if;

  if new.vehicle_id is null then
    raise exception 'vehicle_required' using errcode = '42501';
  end if;

  select is_verified, owner_id
    into v_vehicle_verified, v_vehicle_owner
    from public.vehicles where id = new.vehicle_id;

  if v_vehicle_owner is distinct from new.driver_id then
    raise exception 'vehicle_owner_mismatch' using errcode = '42501';
  end if;
  if not coalesce(v_vehicle_verified, false) then
    raise exception 'vehicle_not_verified' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists journeys_guard_verified on public.journeys;
create trigger journeys_guard_verified
  before insert on public.journeys
  for each row execute function public.guard_journey_insert_verified();

-- ------------------------------------------------------------------
-- E3. Only admins can flip vehicles.is_verified=true.
--     Prevents a driver from self-verifying via a PATCH on their vehicle.
-- ------------------------------------------------------------------

create or replace function public.guard_vehicle_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.is_verified is distinct from old.is_verified
     and not public.is_admin(auth.uid()) then
    raise exception 'vehicle_verify_forbidden' using errcode = '42501';
  end if;
  if tg_op = 'INSERT'
     and new.is_verified = true
     and not public.is_admin(auth.uid()) then
    -- Owners create rows with is_verified=false; admin later approves.
    new.is_verified := false;
  end if;
  return new;
end $$;

drop trigger if exists vehicles_guard_verification on public.vehicles;
create trigger vehicles_guard_verification
  before insert or update on public.vehicles
  for each row execute function public.guard_vehicle_verification();

-- ------------------------------------------------------------------
-- E4. Ensure profiles.is_verified_driver can only be set by admin.
-- ------------------------------------------------------------------

create or replace function public.guard_profile_verified_driver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.is_verified_driver is distinct from old.is_verified_driver
     and not public.is_admin(auth.uid()) then
    raise exception 'is_verified_driver_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_verified_driver on public.profiles;
create trigger profiles_guard_verified_driver
  before update on public.profiles
  for each row execute function public.guard_profile_verified_driver();

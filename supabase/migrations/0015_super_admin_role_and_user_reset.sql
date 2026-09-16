-- 0015_super_admin_role_and_user_reset.sql
--
-- V1 lockdown for the launch build. Two staged changes (they had to ship as
-- separate migrations because ALTER TYPE ADD VALUE cannot share a transaction
-- with anything that uses the new value):
--
--   Step A (applied first):
--     alter type public.role_intent add value if not exists 'super_admin';
--
--   Step B (this file):
--     * Adds profiles.force_password_reset (client shows a Change Password
--       modal on next sign-in and clears the flag afterwards).
--     * Deletes every auth.users row except shemaabdul70@gmail.com. Profiles
--       cascade to that user, and every dependent (journeys, bookings, vehicles,
--       driver_documents, ratings, admin_users) already cascades from profiles.
--     * Promotes shemaabdul70@gmail.com to role_intent='super_admin' and puts
--       them in admin_users with role='super_admin'.
--     * Fixes admin_list_users: the previous version referenced
--       p.last_seen_at, which lives on admin_users, not profiles. Left-join fixes
--       it and adds force_password_reset to the returned columns.
--     * is_admin now honours role_intent='super_admin' too, so a fresh super
--       admin seeded by handle_new_user (no admin_users row yet) still passes.
--     * handle_new_user hardens against a signup that tries to self-elevate
--       to 'super_admin' via raw_user_meta_data.
--
-- To recover: create the new users via normal sign-up flows.

alter table public.profiles
  add column if not exists force_password_reset boolean not null default false;

comment on column public.profiles.force_password_reset is
  'When true, the client prompts the user to set a new password on next sign-in. Cleared after they change it.';

delete from auth.users
 where email is distinct from 'shemaabdul70@gmail.com';

update public.profiles p
   set role_intent = 'super_admin',
       is_disabled = false,
       is_demo = false,
       force_password_reset = true,
       updated_at = now()
  from auth.users u
 where p.id = u.id
   and u.email = 'shemaabdul70@gmail.com';

insert into public.admin_users (id, role)
select u.id, 'super_admin'::public.admin_role
  from auth.users u
 where u.email = 'shemaabdul70@gmail.com'
on conflict (id) do update set role = 'super_admin';

drop function if exists public.admin_list_users(integer);

create function public.admin_list_users(_limit integer default 200)
returns table (
  id uuid, full_name text, phone text, avatar_url text,
  role_intent public.role_intent,
  is_verified_driver boolean, is_demo boolean, is_disabled boolean, force_password_reset boolean,
  rating_avg numeric, rating_count integer, created_at timestamptz, last_seen_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select p.id, p.full_name, p.phone, p.avatar_url, p.role_intent,
           p.is_verified_driver, p.is_demo, p.is_disabled, p.force_password_reset,
           p.rating_avg, p.rating_count, p.created_at, a.last_seen_at
      from public.profiles p left join public.admin_users a on a.id = p.id
      order by p.created_at desc limit greatest(_limit, 1);
end;$$;
revoke all on function public.admin_list_users(integer) from public, anon;
grant execute on function public.admin_list_users(integer) to authenticated;

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users a where a.id = uid)
      or exists (select 1 from public.profiles p where p.id = uid and p.role_intent = 'super_admin');
$$;
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare wanted text; role_val public.role_intent;
begin
  wanted := coalesce(new.raw_user_meta_data->>'role_intent', 'passenger');
  begin role_val := wanted::public.role_intent;
  exception when others then role_val := 'passenger'; end;
  if role_val = 'super_admin' then role_val := 'passenger'; end if;

  insert into public.profiles (id, full_name, phone, role_intent)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
          nullif(btrim(new.raw_user_meta_data->>'phone'), ''),
          role_val)
  on conflict (id) do nothing;

  return new;
end;$$;

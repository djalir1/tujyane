-- 0014_lockdown_demo_accounts.sql
--
-- Adds a soft-disable flag to profiles so pilot/demo accounts can be locked
-- out of sign-in without destroying their historical rows (bookings, journeys,
-- ratings, audit entries) — those stay intact so admin dashboards can still
-- browse the seeded history.
--
-- Follow-ups elsewhere:
--   * AuthProvider signs out any session whose profile.is_disabled = true.
--   * The admin "hide demo accounts" toggle continues to hide is_demo=true rows.
--   * To recover an account: UPDATE profiles SET is_disabled=false WHERE id = <uuid>.

alter table public.profiles
  add column if not exists is_disabled boolean not null default false;

comment on column public.profiles.is_disabled is
  'Soft-disable flag. When true, the AuthProvider signs the user out on session load. '
  'Rows are kept so history and audit trails remain intact — set false to re-enable.';

-- Lock down every seeded demo account. The real super-admin
-- (shemaabdul70@gmail.com) is NOT flagged is_demo=true and is therefore untouched.
update public.profiles
   set is_disabled = true
 where is_demo = true;

-- Safety net: never lock out the real super-admin, even if a future seed marks
-- their profile as demo by accident.
update public.profiles p
   set is_disabled = false
  from auth.users u
 where p.id = u.id
   and u.email = 'shemaabdul70@gmail.com';

-- RLS: a signed-in user must still be able to read their own profile so the
-- AuthProvider can detect is_disabled and sign them out. The existing "read
-- own profile" policy from 0005 still applies — is_disabled is just another
-- column on the same row, no policy change needed.

-- Extend admin_list_users result so the users page can render the disabled
-- state alongside the demo tag.
create or replace function public.admin_list_users(_limit integer default 200)
returns table (
  id uuid,
  full_name text,
  phone text,
  avatar_url text,
  role_intent public.role_intent,
  is_verified_driver boolean,
  is_demo boolean,
  is_disabled boolean,
  rating_avg numeric,
  rating_count integer,
  created_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, p.phone, p.avatar_url, p.role_intent,
           p.is_verified_driver, p.is_demo, p.is_disabled,
           p.rating_avg, p.rating_count, p.created_at, p.last_seen_at
      from public.profiles p
      order by p.created_at desc
      limit greatest(_limit, 1);
end;
$$;

revoke all on function public.admin_list_users(integer) from public, anon;
grant execute on function public.admin_list_users(integer) to authenticated;

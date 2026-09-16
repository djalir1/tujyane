-- 0002_profiles_and_admin.sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text,
  avatar_url text,
  role_intent public.role_intent not null default 'passenger',
  rating_avg numeric(3,2) not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  is_verified_driver boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_intent_idx on public.profiles (role_intent);
create index if not exists profiles_verified_driver_idx on public.profiles (is_verified_driver) where is_verified_driver;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full_name text := coalesce(nullif(meta->>'full_name',''), split_part(new.email, '@', 1));
  v_phone     text := nullif(meta->>'phone','');
  v_role      text := coalesce(nullif(meta->>'role_intent',''), 'passenger');
begin
  if v_role not in ('passenger','driver','both') then
    v_role := 'passenger';
  end if;

  insert into public.profiles (id, full_name, phone, role_intent)
  values (new.id, v_full_name, v_phone, v_role::public.role_intent)
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.admin_users (
  id uuid primary key references public.profiles(id) on delete cascade,
  role public.admin_role not null default 'reviewer',
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from public.admin_users a where a.id = uid);
$$;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;

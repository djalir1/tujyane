-- 0011_admin_stats_rpc.sql
-- Aggregate counts for the admin dashboard + a users listing. SECURITY
-- DEFINER so they can read across tables regardless of the caller's own
-- RLS, while still refusing for non-admins.

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'drivers_pending_verification',
      (select count(distinct driver_id) from public.driver_documents where status = 'pending'),
    'verified_drivers',
      (select count(*) from public.profiles where is_verified_driver = true),
    'total_drivers',
      (select count(*) from public.profiles where role_intent in ('driver','both')),
    'total_users',
      (select count(*) from public.profiles),
    'total_journeys',
      (select count(*) from public.journeys),
    'active_journeys',
      (select count(*) from public.journeys where status = 'active'),
    'total_bookings',
      (select count(*) from public.bookings),
    'completed_bookings',
      (select count(*) from public.bookings where status = 'completed')
  ) into result;
  return result;
end $$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

create or replace function public.admin_list_users(p_limit int default 100, p_offset int default 0)
returns table (
  id uuid, full_name text, phone text, avatar_url text,
  role_intent public.role_intent, is_verified_driver boolean,
  rating_avg numeric, rating_count integer, created_at timestamptz
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
           p.is_verified_driver, p.rating_avg, p.rating_count, p.created_at
    from public.profiles p
    order by p.created_at desc
    limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end $$;

revoke all on function public.admin_list_users(int, int) from public, anon;
grant execute on function public.admin_list_users(int, int) to authenticated;

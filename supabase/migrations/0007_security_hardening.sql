-- 0007_security_hardening.sql

alter function public.set_updated_at() set search_path = public;
alter function public.generate_boarding_code() set search_path = public;

-- Internal helpers never callable over PostgREST.
revoke all on function public.handle_new_user()     from public, anon, authenticated;
revoke all on function public.ratings_after_write() from public, anon, authenticated;
revoke all on function public.refresh_rating(uuid)  from public, anon, authenticated;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;

revoke all on function public.accept_booking(uuid)              from public, anon;
grant  execute on function public.accept_booking(uuid)          to authenticated;
revoke all on function public.cancel_booking(uuid)              from public, anon;
grant  execute on function public.cancel_booking(uuid)          to authenticated;
revoke all on function public.verify_boarding(uuid, text)       from public, anon;
grant  execute on function public.verify_boarding(uuid, text)   to authenticated;
revoke all on function public.approve_driver_document(uuid)     from public, anon;
grant  execute on function public.approve_driver_document(uuid) to authenticated;
revoke all on function public.reject_driver_document(uuid, text) from public, anon;
grant  execute on function public.reject_driver_document(uuid, text) to authenticated;

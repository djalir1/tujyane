-- 0010_private_driver_docs_bucket.sql
-- Private KYC storage. Path convention: <user_id>/<doc_type>-<uuid>.<ext>.
-- IDs and licenses live here; NEVER served with a public URL, only via
-- short-lived signed URLs minted by the admin UI.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-docs',
  'driver-docs',
  false,
  5 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "driver_docs owner read"   on storage.objects;
drop policy if exists "driver_docs admin read"   on storage.objects;
drop policy if exists "driver_docs owner write"  on storage.objects;
drop policy if exists "driver_docs owner update" on storage.objects;
drop policy if exists "driver_docs owner delete" on storage.objects;

create policy "driver_docs owner read" on storage.objects
  for select using (
    bucket_id = 'driver-docs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "driver_docs admin read" on storage.objects
  for select using (
    bucket_id = 'driver-docs'
    and public.is_admin(auth.uid())
  );

create policy "driver_docs owner write" on storage.objects
  for insert with check (
    bucket_id = 'driver-docs'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "driver_docs owner update" on storage.objects
  for update using (
    bucket_id = 'driver-docs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "driver_docs owner delete" on storage.objects
  for delete using (
    bucket_id = 'driver-docs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin-only vehicle verification helper. Owner never toggles is_verified.
create or replace function public.approve_vehicle(p_vehicle_id uuid)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare v public.vehicles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.vehicles set is_verified = true where id = p_vehicle_id returning * into v;
  return v;
end $$;

revoke all on function public.approve_vehicle(uuid) from public, anon;
grant execute on function public.approve_vehicle(uuid) to authenticated;

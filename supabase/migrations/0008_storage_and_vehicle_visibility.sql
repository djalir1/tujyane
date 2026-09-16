-- 0008_storage_and_vehicle_visibility.sql
-- Pilot: passengers viewing an active journey must see vehicle details even
-- while is_verified=false. Relax the vehicles select policy accordingly.

drop policy if exists vehicles_select_verified_or_owner on public.vehicles;
create policy vehicles_select_verified_or_owner on public.vehicles
  for select
  using (
    is_verified
    or auth.uid() = owner_id
    or public.is_admin(auth.uid())
    or exists (
      select 1 from public.journeys j
      where j.vehicle_id = vehicles.id
        and j.status = 'active'
    )
  );
comment on policy vehicles_select_verified_or_owner on public.vehicles is
  'Public sees: verified vehicles OR vehicles used on an active journey (pilot). Owner sees own. Admin sees all.';

-- Vehicle-photos storage bucket. Public read (photos on journey cards).
-- Writes constrained by first path segment == auth.uid() → owners only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  true,
  5 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vehicle_photos read" on storage.objects;
create policy "vehicle_photos read" on storage.objects
  for select using (bucket_id = 'vehicle-photos');

drop policy if exists "vehicle_photos insert" on storage.objects;
create policy "vehicle_photos insert" on storage.objects
  for insert with check (
    bucket_id = 'vehicle-photos'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "vehicle_photos update" on storage.objects;
create policy "vehicle_photos update" on storage.objects
  for update using (
    bucket_id = 'vehicle-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "vehicle_photos delete" on storage.objects;
create policy "vehicle_photos delete" on storage.objects
  for delete using (
    bucket_id = 'vehicle-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

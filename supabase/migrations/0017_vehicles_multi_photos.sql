-- 0017_vehicles_multi_photos.sql
--
-- Allow up to 5 photos per vehicle. Backwards-compatible:
--   * The existing `photo_url` column stays; new inserts also set the first
--     photo there so any legacy JOIN keeps working (search results, admin
--     lists, join queries in JOURNEY_JOIN_COLS).
--   * A new `photo_urls text[]` column carries the full list.
--   * A CHECK caps the array at 5 entries so a runaway upload can't blow up
--     one vehicle's row.

alter table public.vehicles
  add column if not exists photo_urls text[] not null default '{}';

alter table public.vehicles
  drop constraint if exists vehicles_photo_urls_max_len;

alter table public.vehicles
  add constraint vehicles_photo_urls_max_len
    check (array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 5);

comment on column public.vehicles.photo_urls is
  'Up to 5 public URLs to car photos, ordered driver-supplied. The first URL is also mirrored to photo_url for legacy joins.';

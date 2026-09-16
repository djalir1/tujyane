-- 0005_rls_policies.sql
-- Enable RLS on every table + explicit policies.
--   * anon can browse journeys, verified vehicles, and rating aggregates.
--   * Only owners can mutate their own rows.
--   * driver_documents is private to the owning driver + admins.
--   * State transitions (booking status, seat decrement, boarding code) live
--     in SECURITY DEFINER RPCs — see 0006.
--   * Ratings insertable only after booking.status='completed' by a participant.

-- ---------- profiles ----------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select using (true);
comment on policy profiles_select_public on public.profiles is
  'Public profile fields are visible to all (name/avatar/rating). Do not add sensitive columns without narrowing this.';

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
comment on policy profiles_update_self on public.profiles is
  'Owners edit their own profile. is_verified_driver, rating_avg, rating_count are set by triggers/admin RPCs, not clients.';

-- ---------- vehicles ----------
alter table public.vehicles enable row level security;

drop policy if exists vehicles_select_verified_or_owner on public.vehicles;
create policy vehicles_select_verified_or_owner on public.vehicles
  for select using (is_verified or auth.uid() = owner_id or public.is_admin(auth.uid()));

drop policy if exists vehicles_owner_insert on public.vehicles;
create policy vehicles_owner_insert on public.vehicles
  for insert with check (auth.uid() = owner_id);

drop policy if exists vehicles_owner_update on public.vehicles;
create policy vehicles_owner_update on public.vehicles
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists vehicles_owner_delete on public.vehicles;
create policy vehicles_owner_delete on public.vehicles
  for delete using (auth.uid() = owner_id);

-- ---------- driver_documents ----------
alter table public.driver_documents enable row level security;

drop policy if exists driver_documents_select_scoped on public.driver_documents;
create policy driver_documents_select_scoped on public.driver_documents
  for select using (auth.uid() = driver_id or public.is_admin(auth.uid()));

drop policy if exists driver_documents_insert_self on public.driver_documents;
create policy driver_documents_insert_self on public.driver_documents
  for insert with check (auth.uid() = driver_id);

drop policy if exists driver_documents_update_scoped on public.driver_documents;
create policy driver_documents_update_scoped on public.driver_documents
  for update
  using ((auth.uid() = driver_id and status = 'pending') or public.is_admin(auth.uid()))
  with check ((auth.uid() = driver_id and status = 'pending') or public.is_admin(auth.uid()));

drop policy if exists driver_documents_delete_self on public.driver_documents;
create policy driver_documents_delete_self on public.driver_documents
  for delete using (auth.uid() = driver_id and status = 'pending');

-- ---------- journeys ----------
alter table public.journeys enable row level security;

drop policy if exists journeys_select_active_or_owner on public.journeys;
create policy journeys_select_active_or_owner on public.journeys
  for select using (
    status = 'active'
    or auth.uid() = driver_id
    or public.is_admin(auth.uid())
    or exists (
      select 1 from public.bookings b
      where b.journey_id = journeys.id and b.passenger_id = auth.uid()
    )
  );

drop policy if exists journeys_insert_own on public.journeys;
create policy journeys_insert_own on public.journeys
  for insert with check (auth.uid() = driver_id);

drop policy if exists journeys_update_own on public.journeys;
create policy journeys_update_own on public.journeys
  for update using (auth.uid() = driver_id) with check (auth.uid() = driver_id);

drop policy if exists journeys_delete_own on public.journeys;
create policy journeys_delete_own on public.journeys
  for delete using (auth.uid() = driver_id and status in ('active','cancelled'));

-- ---------- bookings ----------
alter table public.bookings enable row level security;

drop policy if exists bookings_select_participants on public.bookings;
create policy bookings_select_participants on public.bookings
  for select using (
    auth.uid() = passenger_id
    or exists (select 1 from public.journeys j
               where j.id = bookings.journey_id and j.driver_id = auth.uid())
    or public.is_admin(auth.uid())
  );

drop policy if exists bookings_insert_passenger on public.bookings;
create policy bookings_insert_passenger on public.bookings
  for insert with check (
    auth.uid() = passenger_id
    and status = 'requested'
    and boarding_code is null
    and exists (
      select 1 from public.journeys j
      where j.id = journey_id
        and j.status = 'active'
        and j.seats_available >= seats_booked
        and j.driver_id <> auth.uid()
    )
  );

drop policy if exists bookings_update_passenger on public.bookings;
create policy bookings_update_passenger on public.bookings
  for update
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id and status in ('cancelled'));

drop policy if exists bookings_update_driver on public.bookings;
create policy bookings_update_driver on public.bookings
  for update
  using (exists (select 1 from public.journeys j
                 where j.id = bookings.journey_id and j.driver_id = auth.uid()))
  with check (
    exists (select 1 from public.journeys j
            where j.id = bookings.journey_id and j.driver_id = auth.uid())
    and status in ('rejected','boarding','in_trip','completed','no_show')
  );

comment on table public.bookings is
$$Status transition matrix (who updates → target):
  passenger: requested -> cancelled ; accepted -> cancelled
  driver:    requested -> rejected  (direct update ok)
             requested -> accepted  (must use RPC accept_booking — issues boarding_code & decrements seats atomically)
             accepted  -> boarding | in_trip | completed | no_show
Ratings only writable once status='completed'.$$;

drop policy if exists bookings_delete_passenger on public.bookings;
create policy bookings_delete_passenger on public.bookings
  for delete using (auth.uid() = passenger_id and status in ('requested','cancelled','rejected'));

-- ---------- ratings ----------
alter table public.ratings enable row level security;

drop policy if exists ratings_select_public on public.ratings;
create policy ratings_select_public on public.ratings for select using (true);

drop policy if exists ratings_insert_participant on public.ratings;
create policy ratings_insert_participant on public.ratings
  for insert with check (
    auth.uid() = rater_id
    and exists (
      select 1
      from public.bookings b
      join public.journeys j on j.id = b.journey_id
      where b.id = booking_id
        and b.status = 'completed'
        and (
          (b.passenger_id = auth.uid() and j.driver_id = ratee_id)
          or (j.driver_id = auth.uid() and b.passenger_id = ratee_id)
        )
    )
  );

drop policy if exists ratings_update_self on public.ratings;
create policy ratings_update_self on public.ratings
  for update using (auth.uid() = rater_id) with check (auth.uid() = rater_id);

drop policy if exists ratings_delete_self on public.ratings;
create policy ratings_delete_self on public.ratings
  for delete using (auth.uid() = rater_id or public.is_admin(auth.uid()));

-- ---------- admin_users ----------
alter table public.admin_users enable row level security;

drop policy if exists admin_users_select_admin on public.admin_users;
create policy admin_users_select_admin on public.admin_users
  for select using (public.is_admin(auth.uid()));

drop policy if exists admin_users_write_super on public.admin_users;
create policy admin_users_write_super on public.admin_users
  for all
  using  (exists (select 1 from public.admin_users a where a.id = auth.uid() and a.role = 'super_admin'))
  with check (exists (select 1 from public.admin_users a where a.id = auth.uid() and a.role = 'super_admin'));

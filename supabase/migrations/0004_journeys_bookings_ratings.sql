-- 0004_journeys_bookings_ratings.sql
create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  origin_text text not null,
  origin_point geography(Point, 4326),
  destination_text text not null,
  destination_point geography(Point, 4326),
  departure_time timestamptz not null,
  recurrence public.recurrence not null default 'once',
  seats_total integer not null check (seats_total between 1 and 20),
  seats_available integer not null check (seats_available >= 0),
  suggested_contribution integer not null default 0 check (suggested_contribution >= 0),
  luggage_allowed boolean not null default true,
  pets_allowed boolean not null default false,
  smoking_allowed boolean not null default false,
  women_only boolean not null default false,
  notes text,
  status public.journey_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (seats_available <= seats_total)
);

create index if not exists journeys_active_departure_idx
  on public.journeys (departure_time)
  where status = 'active';
create index if not exists journeys_driver_idx on public.journeys (driver_id);
create index if not exists journeys_origin_gix on public.journeys using gist (origin_point);
create index if not exists journeys_destination_gix on public.journeys using gist (destination_point);

drop trigger if exists journeys_set_updated_at on public.journeys;
create trigger journeys_set_updated_at
  before update on public.journeys
  for each row execute function public.set_updated_at();

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  seats_booked integer not null default 1 check (seats_booked between 1 and 8),
  status public.booking_status not null default 'requested',
  boarding_code text check (boarding_code ~ '^[0-9]{4}$'),
  contribution_amount integer check (contribution_amount is null or contribution_amount >= 0),
  payment_status public.payment_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, passenger_id)
);

create index if not exists bookings_journey_idx on public.bookings (journey_id);
create index if not exists bookings_passenger_idx on public.bookings (passenger_id);
create index if not exists bookings_status_idx on public.bookings (status);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (booking_id, rater_id),
  check (rater_id <> ratee_id)
);

create index if not exists ratings_ratee_idx on public.ratings (ratee_id);
create index if not exists ratings_booking_idx on public.ratings (booking_id);

create or replace function public.refresh_rating(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles p
  set
    rating_avg = coalesce((select round(avg(score)::numeric, 2) from public.ratings where ratee_id = target), 0),
    rating_count = (select count(*) from public.ratings where ratee_id = target)
  where p.id = target;
$$;

create or replace function public.ratings_after_write()
returns trigger language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_rating(coalesce(new.ratee_id, old.ratee_id));
  return null;
end $$;

drop trigger if exists ratings_refresh_aiud on public.ratings;
create trigger ratings_refresh_aiud
  after insert or update or delete on public.ratings
  for each row execute function public.ratings_after_write();

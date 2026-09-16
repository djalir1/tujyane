-- 0012_locations_pricing_and_journey_cols.sql
-- A. locations table + read-all RLS
-- B. pricing_config single-row + read-all RLS
-- C. journeys extra columns + band-enforcing trigger

do $$ begin
  create type public.location_type as enum ('city','town','node','border','international');
exception when duplicate_object then null; end $$;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text,
  type public.location_type not null default 'town',
  lat double precision,
  lng double precision,
  is_active boolean not null default true,
  sort_key int not null default 0,
  created_at timestamptz not null default now(),
  unique (name, district)
);
create index if not exists locations_active_idx on public.locations (is_active) where is_active;
create index if not exists locations_lower_name_idx on public.locations (lower(name));

alter table public.locations enable row level security;
drop policy if exists locations_read_all on public.locations;
create policy locations_read_all on public.locations for select using (true);

create table if not exists public.pricing_config (
  id integer primary key check (id = 1) default 1,
  per_km_petrol   integer not null default 120,
  per_km_diesel   integer not null default 100,
  per_km_hybrid   integer not null default 80,
  per_km_electric integer not null default 55,
  min_contribution integer not null default 500,
  adjust_band_pct  integer not null default 10 check (adjust_band_pct between 0 and 50),
  updated_at timestamptz not null default now()
);
alter table public.pricing_config enable row level security;
drop policy if exists pricing_config_read_all on public.pricing_config;
create policy pricing_config_read_all on public.pricing_config for select using (true);

alter table public.journeys
  add column if not exists origin_location_id      uuid references public.locations(id),
  add column if not exists destination_location_id uuid references public.locations(id),
  add column if not exists distance_km             numeric(7,2),
  add column if not exists contribution_per_seat   integer;
create index if not exists journeys_origin_location_idx on public.journeys (origin_location_id);
create index if not exists journeys_destination_location_idx on public.journeys (destination_location_id);

create or replace function public.enforce_contribution_band()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cfg public.pricing_config%rowtype;
  band numeric;
  low_bound integer;
  high_bound integer;
begin
  if new.contribution_per_seat is null then return new; end if;
  select * into cfg from public.pricing_config where id = 1;
  if cfg is null then return new; end if;
  band := cfg.adjust_band_pct::numeric / 100;
  low_bound  := greatest(cfg.min_contribution, floor(new.suggested_contribution * (1 - band))::integer);
  high_bound := ceil(new.suggested_contribution * (1 + band))::integer;

  if new.contribution_per_seat < low_bound  then raise exception 'contribution_below_band' using errcode = 'P0001'; end if;
  if new.contribution_per_seat > high_bound then raise exception 'contribution_above_band' using errcode = 'P0001'; end if;
  return new;
end $$;

drop trigger if exists journeys_enforce_contribution_band on public.journeys;
create trigger journeys_enforce_contribution_band
  before insert or update on public.journeys
  for each row execute function public.enforce_contribution_band();

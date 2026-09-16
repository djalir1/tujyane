-- 0020_corridor_fares_and_pricing_rework.sql
--
-- Pricing rework (Batch 3 Part B): TUJYANE must sit visibly cheaper than the
-- bus while staying fair to the driver. We take the per-km baseline and cap
-- it at a percentage below the local bus fare when a real reference exists.
--
-- Schema:
--   * pricing_config gains `bus_discount_pct` — how much cheaper than the
--     bus fare the SUGGESTED per-seat contribution should be (default 20%).
--   * corridor_fares — one row per real corridor with a known bus fare.
--     Directionless (either direction hits the same row) is a client concern;
--     admins insert with whichever pair they prefer.
--
-- Trigger `enforce_contribution_band` extended:
--   * On top of the ±adjust_band_pct check, when a corridor_fares row exists
--     for the journey's origin/destination, contribution_per_seat is HARD-
--     CAPPED at the bus fare — no matter what the ±band would allow.

alter table public.pricing_config
  add column if not exists bus_discount_pct integer not null default 20
    check (bus_discount_pct between 0 and 60);

comment on column public.pricing_config.bus_discount_pct is
  'How much cheaper the SUGGESTED per-seat contribution should be than the local bus fare when a corridor_fares row exists. Applied as suggested = min(per_km_baseline, bus_fare * (1 - bus_discount_pct/100)).';

create table if not exists public.corridor_fares (
  id uuid primary key default gen_random_uuid(),
  origin_location_id      uuid not null references public.locations(id) on delete cascade,
  destination_location_id uuid not null references public.locations(id) on delete cascade,
  bus_fare_rwf integer check (bus_fare_rwf is null or bus_fare_rwf > 0),
  notes text,
  updated_at timestamptz not null default now(),
  unique (origin_location_id, destination_location_id),
  check (origin_location_id <> destination_location_id)
);

create index if not exists corridor_fares_origin_idx on public.corridor_fares (origin_location_id);
create index if not exists corridor_fares_dest_idx   on public.corridor_fares (destination_location_id);

alter table public.corridor_fares enable row level security;
drop policy if exists corridor_fares_read_all on public.corridor_fares;
create policy corridor_fares_read_all on public.corridor_fares
  for select using (true);
-- Writes admin-only. Everyone else can read the reference.
drop policy if exists corridor_fares_admin_write on public.corridor_fares;
create policy corridor_fares_admin_write on public.corridor_fares
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Seed the one confirmed real reference (Nyabugogo <-> Musanze ~ 3,821 RWF)
-- and mark the popular corridors we serve as null so admins see the queue.
INSERT INTO public.corridor_fares (origin_location_id, destination_location_id, bus_fare_rwf, notes)
SELECT o.id, d.id, 3821, 'Ritco/Volcano coach (2026 pilot reference)'
FROM public.locations o, public.locations d
WHERE o.name = 'Nyabugogo' AND d.name = 'Musanze'
ON CONFLICT DO NOTHING;

INSERT INTO public.corridor_fares (origin_location_id, destination_location_id, bus_fare_rwf, notes)
SELECT o.id, d.id, NULL, 'Fill in when a real fare is confirmed'
FROM public.locations o, public.locations d
WHERE (o.name, d.name) IN (
  ('Nyabugogo','Rubavu (Gisenyi)'),
  ('Nyabugogo','Huye'),
  ('Nyabugogo','Kayonza'),
  ('Nyabugogo','Nyagatare'),
  ('Nyabugogo','Rusizi (Kamembe)'),
  ('Nyabugogo','Byumba (Gicumbi)')
)
ON CONFLICT DO NOTHING;

-- Rewrite the band-enforcing trigger to add the bus-fare hard cap.
CREATE OR REPLACE FUNCTION public.enforce_contribution_band()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg public.pricing_config%rowtype;
  band numeric;
  low_bound integer;
  high_bound integer;
  bus_fare integer;
BEGIN
  IF new.contribution_per_seat IS NULL THEN RETURN new; END IF;
  SELECT * INTO cfg FROM public.pricing_config WHERE id = 1;
  IF cfg IS NULL THEN RETURN new; END IF;
  band := cfg.adjust_band_pct::numeric / 100;
  low_bound  := greatest(cfg.min_contribution, floor(new.suggested_contribution * (1 - band))::integer);
  high_bound := ceil(new.suggested_contribution * (1 + band))::integer;

  IF new.contribution_per_seat < low_bound  THEN
    RAISE EXCEPTION 'contribution_below_band' USING errcode = 'P0001';
  END IF;
  IF new.contribution_per_seat > high_bound THEN
    RAISE EXCEPTION 'contribution_above_band' USING errcode = 'P0001';
  END IF;

  -- Extra: HARD cap at the bus fare when a corridor reference exists.
  -- Either direction counts.
  SELECT cf.bus_fare_rwf INTO bus_fare
    FROM public.corridor_fares cf
   WHERE (cf.origin_location_id = new.origin_location_id
          AND cf.destination_location_id = new.destination_location_id)
      OR (cf.origin_location_id = new.destination_location_id
          AND cf.destination_location_id = new.origin_location_id)
   LIMIT 1;
  IF bus_fare IS NOT NULL AND new.contribution_per_seat > bus_fare THEN
    RAISE EXCEPTION 'contribution_above_bus_fare' USING errcode = 'P0001';
  END IF;

  RETURN new;
END $$;

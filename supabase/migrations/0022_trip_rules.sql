-- 0022_trip_rules.sql
--
-- Trip/booking logic rules — server-side. Mirrors client-side rules in
-- src/lib/validation.ts. These triggers/RPCs are the SOURCE OF TRUTH — the
-- client checks are for UX only.
--
-- Rules added / enforced here:
--   * journeys.departure_time > now() at INSERT (past times refused).
--   * journeys.seats_total 1..vehicle.seats at INSERT/UPDATE.
--   * A vehicle can only be on ONE non-terminal journey at a time
--     (status in active/full/in_trip). Prevents double-booking a car.
--   * start_trip(booking_id) — driver's "start now" action. Refused before
--     departure_time.
--
-- All idempotent.

-- ============================================================
-- (A) Departure time must be strictly future on INSERT
-- 60s grace to absorb browser/clock skew. Updates aren't restricted
-- (driver can reschedule to a NEW future time; UI enforces future too).
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_journey_departure_future()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF tg_op = 'INSERT'
     AND new.departure_time <= (now() - interval '60 seconds')
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'departure_in_past' USING errcode = 'P0001';
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS journeys_guard_departure_future ON public.journeys;
CREATE TRIGGER journeys_guard_departure_future
  BEFORE INSERT ON public.journeys
  FOR EACH ROW EXECUTE FUNCTION public.guard_journey_departure_future();

-- ============================================================
-- (B) seats_total must fit the vehicle's declared capacity
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_journey_seats_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_capacity int;
BEGIN
  SELECT seats INTO v_capacity FROM public.vehicles WHERE id = new.vehicle_id;
  IF v_capacity IS NULL THEN RETURN new; END IF;   -- vehicle FK will catch this separately
  IF new.seats_total > v_capacity THEN
    RAISE EXCEPTION 'seats_over_capacity' USING errcode = 'P0001';
  END IF;
  IF new.seats_total < 1 THEN
    RAISE EXCEPTION 'seats_below_min' USING errcode = 'P0001';
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS journeys_guard_seats_capacity ON public.journeys;
CREATE TRIGGER journeys_guard_seats_capacity
  BEFORE INSERT OR UPDATE OF seats_total, vehicle_id ON public.journeys
  FOR EACH ROW EXECUTE FUNCTION public.guard_journey_seats_capacity();

-- ============================================================
-- (C) One non-terminal trip per vehicle
-- Non-terminal statuses that must not collide: active, full, in_trip.
-- We check at INSERT and at UPDATEs that reactivate a trip. Same trip
-- flipping status back and forth is fine as long as no OTHER trip on the
-- same vehicle is also non-terminal.
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_journey_one_active_per_vehicle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_collision uuid;
BEGIN
  -- Skip when moving to a terminal state.
  IF new.status IN ('cancelled', 'completed') THEN RETURN new; END IF;
  IF new.vehicle_id IS NULL THEN RETURN new; END IF;

  SELECT j.id INTO v_collision
    FROM public.journeys j
   WHERE j.vehicle_id = new.vehicle_id
     AND j.id <> COALESCE(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND j.status IN ('active', 'full', 'in_trip')
   LIMIT 1;

  IF v_collision IS NOT NULL THEN
    RAISE EXCEPTION 'vehicle_already_on_active_trip' USING errcode = 'P0001';
  END IF;

  RETURN new;
END $$;

DROP TRIGGER IF EXISTS journeys_guard_one_active_per_vehicle ON public.journeys;
CREATE TRIGGER journeys_guard_one_active_per_vehicle
  BEFORE INSERT OR UPDATE OF vehicle_id, status ON public.journeys
  FOR EACH ROW EXECUTE FUNCTION public.guard_journey_one_active_per_vehicle();

-- ============================================================
-- (D) Add 'in_trip' to journey_status enum if missing
-- ============================================================
DO $$ BEGIN
  ALTER TYPE public.journey_status ADD VALUE IF NOT EXISTS 'in_trip';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- (E) start_trip RPC — driver's "start now" action.
-- Refused before departure_time, and only for the journey's driver.
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_trip(p_journey_id uuid)
RETURNS public.journeys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_journey public.journeys;
BEGIN
  SELECT * INTO v_journey FROM public.journeys WHERE id = p_journey_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'journey_not_found' USING errcode = 'P0002'; END IF;

  IF v_journey.driver_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_journey_driver' USING errcode = '42501';
  END IF;

  IF v_journey.status NOT IN ('active', 'full') THEN
    RAISE EXCEPTION 'journey_not_ready_to_start' USING errcode = 'P0001';
  END IF;

  IF v_journey.departure_time > now() THEN
    RAISE EXCEPTION 'trip_not_yet_startable' USING errcode = 'P0001';
  END IF;

  UPDATE public.journeys
     SET status = 'in_trip'
   WHERE id = v_journey.id
  RETURNING * INTO v_journey;

  RETURN v_journey;
END $$;

REVOKE ALL ON FUNCTION public.start_trip(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_trip(uuid) TO authenticated;

-- ============================================================
-- (F) complete_trip RPC — closes a running trip cleanly.
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_trip(p_journey_id uuid)
RETURNS public.journeys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_journey public.journeys;
BEGIN
  SELECT * INTO v_journey FROM public.journeys WHERE id = p_journey_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'journey_not_found' USING errcode = 'P0002'; END IF;
  IF v_journey.driver_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_journey_driver' USING errcode = '42501';
  END IF;
  IF v_journey.status NOT IN ('active', 'full', 'in_trip') THEN
    RAISE EXCEPTION 'journey_not_running' USING errcode = 'P0001';
  END IF;

  UPDATE public.journeys SET status = 'completed' WHERE id = v_journey.id RETURNING * INTO v_journey;
  RETURN v_journey;
END $$;

REVOKE ALL ON FUNCTION public.complete_trip(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_trip(uuid) TO authenticated;

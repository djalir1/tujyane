-- 0024_driver_before_car_ordering.sql
--
-- Ordering rule: a car can only be verified AFTER its owner (person) is
-- verified. Admin approvals of vehicle docs are silently queued but the
-- car's is_verified flag can only flip to true when profiles.is_verified_driver
-- is already true for the owner.
--
-- Server-side enforcement so an accidentally-clicked "Approve vehicle" or a
-- crafted request can never verify a car whose driver hasn't been cleared.
--
-- Belt: recompute_vehicle_verification now checks driver verification first.
-- Braces: guard_vehicle_verification (0016 / 0021) also refuses direct
--   is_verified=true UPDATEs when the owner is not verified.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.recompute_vehicle_verification(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified boolean;
  v_owner_id uuid;
  v_owner_verified boolean;
  v_today date := current_date;
BEGIN
  SELECT owner_id INTO v_owner_id FROM public.vehicles WHERE id = p_vehicle_id;
  IF v_owner_id IS NULL THEN RETURN false; END IF;

  SELECT is_verified_driver INTO v_owner_verified
    FROM public.profiles WHERE id = v_owner_id;

  -- Rule 1: driver must be verified. If not, the car can NEVER be verified
  -- regardless of its docs. Ensures the "identity → car → post" chain.
  IF NOT COALESCE(v_owner_verified, false) THEN
    UPDATE public.vehicles SET is_verified = false WHERE id = p_vehicle_id;
    RETURN false;
  END IF;

  -- Rule 2: required docs approved and non-expired.
  v_verified := (
    EXISTS (SELECT 1 FROM public.driver_documents
             WHERE vehicle_id = p_vehicle_id
               AND doc_type = 'vehicle_registration'
               AND status = 'approved'
               AND (expiry_date IS NULL OR expiry_date >= v_today))
    AND EXISTS (SELECT 1 FROM public.driver_documents
                 WHERE vehicle_id = p_vehicle_id
                   AND doc_type = 'car_photo'
                   AND status = 'approved')
    AND EXISTS (SELECT 1 FROM public.driver_documents
                 WHERE vehicle_id = p_vehicle_id
                   AND doc_type = 'insurance_certificate'
                   AND status = 'approved'
                   AND expiry_date IS NOT NULL
                   AND expiry_date >= v_today)
  );

  UPDATE public.vehicles SET is_verified = v_verified WHERE id = p_vehicle_id;
  RETURN v_verified;
END $$;
REVOKE ALL ON FUNCTION public.recompute_vehicle_verification(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recompute_vehicle_verification(uuid) TO authenticated;

-- Tighten guard_vehicle_verification: even an admin cannot flip is_verified=true
-- unless the driver is verified. Keeps behavior symmetric with recompute.
CREATE OR REPLACE FUNCTION public.guard_vehicle_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_verified boolean;
BEGIN
  IF tg_op = 'UPDATE'
     AND new.is_verified IS DISTINCT FROM old.is_verified
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'vehicle_verify_forbidden' USING errcode = '42501';
  END IF;
  IF tg_op = 'INSERT'
     AND new.is_verified = true
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin(auth.uid()) THEN
    new.is_verified := false;
  END IF;
  -- Enforce ordering: refuse a true flip if the owner isn't verified.
  IF new.is_verified = true THEN
    SELECT is_verified_driver INTO v_owner_verified
      FROM public.profiles WHERE id = new.owner_id;
    IF NOT COALESCE(v_owner_verified, false) THEN
      RAISE EXCEPTION 'driver_not_verified' USING errcode = 'P0001';
    END IF;
  END IF;
  RETURN new;
END $$;

-- When a driver becomes verified, recompute all their vehicles so any car
-- that already has all docs approved flips to verified immediately.
CREATE OR REPLACE FUNCTION public.on_profile_verify_status_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF new.is_verified_driver IS DISTINCT FROM old.is_verified_driver THEN
    FOR r IN SELECT id FROM public.vehicles WHERE owner_id = new.id LOOP
      PERFORM public.recompute_vehicle_verification(r.id);
    END LOOP;
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS profiles_on_verify_status_changed ON public.profiles;
CREATE TRIGGER profiles_on_verify_status_changed
  AFTER UPDATE OF is_verified_driver ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_verify_status_changed();

-- Recompute every existing vehicle in case pre-existing state now disagrees
-- with the tightened rule.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.vehicles LOOP
    PERFORM public.recompute_vehicle_verification(r.id);
  END LOOP;
END $$;

-- Remove the temporary storage purge helper.
DROP FUNCTION IF EXISTS public.admin_purge_orphan_storage(uuid);

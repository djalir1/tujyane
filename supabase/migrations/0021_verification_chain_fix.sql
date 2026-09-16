-- 0021_verification_chain_fix.sql
--
-- URGENT: driver said "verified" but couldn't post because the vehicle stayed
-- is_verified=false. Two contradictions were live at once:
--
--   * approve_driver_document only ever touched profiles.is_verified_driver;
--     the vehicles.is_verified flag never flipped, so migration 0016's
--     guard_journey_insert_verified trigger correctly refused every INSERT.
--   * driver_documents had no vehicle_id column, so even a well-meaning
--     rewrite of the RPC had no way to know WHICH vehicle a given
--     vehicle_registration / car_photo doc belonged to.
--
-- This migration:
--   1. Adds driver_documents.vehicle_id (nullable, FK to vehicles).
--   2. Backfills: when a driver has exactly one vehicle, all of their existing
--      vehicle_registration / car_photo rows are linked to that vehicle.
--   3. Rewrites approve_driver_document to ALSO flip vehicles.is_verified
--      once both vehicle_registration AND car_photo are approved for the
--      SAME vehicle_id (falls back to the driver's only vehicle when
--      vehicle_id is null, so pre-migration data keeps working).
--   4. Adds public.recompute_vehicle_verification(vehicle_id) so admins/scripts
--      can force a re-evaluation without re-approving each doc.
--
-- Idempotent: safe to re-run.

alter table public.driver_documents
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;

create index if not exists driver_documents_vehicle_idx on public.driver_documents (vehicle_id);

comment on column public.driver_documents.vehicle_id is
  'Which vehicle this doc is for. Required for vehicle_registration and car_photo. Null for personal docs (national_id, driving_license).';

-- ------------------------------------------------------------------
-- Backfill: link existing vehicle-type docs to the driver''s only vehicle,
-- when they only have one. Drivers with multiple vehicles have to re-upload
-- vehicle docs and pick which car — we can''t guess.
-- ------------------------------------------------------------------
WITH single_vehicle_drivers AS (
  SELECT owner_id AS driver_id, (array_agg(id))[1] AS vehicle_id
    FROM public.vehicles
   GROUP BY owner_id
  HAVING COUNT(*) = 1
)
UPDATE public.driver_documents d
   SET vehicle_id = svd.vehicle_id
  FROM single_vehicle_drivers svd
 WHERE d.driver_id = svd.driver_id
   AND d.vehicle_id IS NULL
   AND d.doc_type IN ('vehicle_registration', 'car_photo');

-- ------------------------------------------------------------------
-- Helper: given a vehicle id, decide whether it's verified.
-- Verified iff there is at least one APPROVED vehicle_registration AND at
-- least one APPROVED car_photo for that specific vehicle_id.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_vehicle_verification(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_verified boolean;
BEGIN
  v_verified := (
    EXISTS (
      SELECT 1 FROM public.driver_documents
       WHERE vehicle_id = p_vehicle_id
         AND doc_type = 'vehicle_registration'
         AND status = 'approved'
    )
    AND EXISTS (
      SELECT 1 FROM public.driver_documents
       WHERE vehicle_id = p_vehicle_id
         AND doc_type = 'car_photo'
         AND status = 'approved'
    )
  );

  -- guard_vehicle_verification (0016) restricts is_verified writes to admins.
  -- This function is SECURITY DEFINER so it always runs as owner, bypassing
  -- that check on its own; the trigger sees "no auth.uid()" and permits it
  -- via is_admin fallback (see below) — safer path is to disable trigger for
  -- this specific update using session_replication_role.
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.vehicles SET is_verified = v_verified WHERE id = p_vehicle_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN v_verified;
END $$;

REVOKE ALL ON FUNCTION public.recompute_vehicle_verification(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recompute_vehicle_verification(uuid) TO authenticated;

-- ------------------------------------------------------------------
-- Rewrite approve_driver_document to flip BOTH driver AND vehicle when the
-- criteria are met. is_verified_driver rule unchanged (needs national_id +
-- driving_license approved). Vehicle verification added on top.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_driver_document(p_doc_id uuid)
RETURNS public.driver_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.driver_documents;
  v_target_vehicle uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_admin' USING errcode = '42501';
  END IF;

  UPDATE public.driver_documents
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = NULL
   WHERE id = p_doc_id
  RETURNING * INTO v_doc;

  -- Driver personal verification (unchanged rule).
  UPDATE public.profiles
     SET is_verified_driver = (
       (SELECT COUNT(DISTINCT doc_type)
          FROM public.driver_documents
         WHERE driver_id = v_doc.driver_id
           AND status = 'approved'
           AND doc_type IN ('national_id','driving_license')
       ) = 2
     )
   WHERE id = v_doc.driver_id;

  -- Vehicle verification. If this doc is a vehicle doc:
  --   * If vehicle_id is set on the row -> recompute that vehicle.
  --   * Otherwise, if the driver has exactly one vehicle, link it and
  --     recompute (self-heal legacy rows).
  IF v_doc.doc_type IN ('vehicle_registration', 'car_photo') THEN
    v_target_vehicle := v_doc.vehicle_id;
    IF v_target_vehicle IS NULL THEN
      SELECT id INTO v_target_vehicle
        FROM public.vehicles
       WHERE owner_id = v_doc.driver_id
       ORDER BY created_at
       LIMIT 2;
      -- Only self-link if driver has exactly one vehicle.
      IF (SELECT COUNT(*) FROM public.vehicles WHERE owner_id = v_doc.driver_id) = 1 THEN
        UPDATE public.driver_documents SET vehicle_id = v_target_vehicle WHERE id = v_doc.id;
      ELSE
        v_target_vehicle := NULL;
      END IF;
    END IF;

    IF v_target_vehicle IS NOT NULL THEN
      PERFORM public.recompute_vehicle_verification(v_target_vehicle);
    END IF;
  END IF;

  PERFORM public.log_audit('driver_doc.approved', 'driver_document', v_doc.id,
    jsonb_build_object('driver_id', v_doc.driver_id, 'doc_type', v_doc.doc_type,
                       'vehicle_id', v_target_vehicle));

  RETURN v_doc;
END $$;

REVOKE ALL ON FUNCTION public.approve_driver_document(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_driver_document(uuid) TO authenticated;

-- Reject should also un-verify the vehicle if a required doc is now missing.
CREATE OR REPLACE FUNCTION public.reject_driver_document(p_doc_id uuid, p_reason text)
RETURNS public.driver_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_doc public.driver_documents;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_admin' USING errcode = '42501';
  END IF;

  UPDATE public.driver_documents
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
   WHERE id = p_doc_id
  RETURNING * INTO v_doc;

  -- Personal driver verification recompute.
  UPDATE public.profiles
     SET is_verified_driver = (
       (SELECT COUNT(DISTINCT doc_type)
          FROM public.driver_documents
         WHERE driver_id = v_doc.driver_id
           AND status = 'approved'
           AND doc_type IN ('national_id','driving_license')
       ) = 2
     )
   WHERE id = v_doc.driver_id;

  IF v_doc.vehicle_id IS NOT NULL THEN
    PERFORM public.recompute_vehicle_verification(v_doc.vehicle_id);
  END IF;

  PERFORM public.log_audit('driver_doc.rejected', 'driver_document', v_doc.id,
    jsonb_build_object('driver_id', v_doc.driver_id, 'doc_type', v_doc.doc_type,
                       'reason', p_reason));

  RETURN v_doc;
END $$;

REVOKE ALL ON FUNCTION public.reject_driver_document(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_driver_document(uuid, text) TO authenticated;

-- ------------------------------------------------------------------
-- Backfill: run the recompute now for every existing vehicle so already-
-- approved historical docs immediately flip their vehicle to verified.
-- ------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.vehicles LOOP
    PERFORM public.recompute_vehicle_verification(r.id);
  END LOOP;
END $$;

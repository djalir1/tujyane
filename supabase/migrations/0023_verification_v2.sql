-- 0023_verification_v2.sql
--
-- Batch V2: verification & documents deepening.
--
--   * doc_type gains 'insurance_certificate' and 'inspection_certificate'.
--   * driver_documents gains issue_date, expiry_date, doc_number,
--     inspection_result (for insurance/inspection).
--   * vehicles: platform-wide unique plate_number (case-insensitive), plus
--     a CHECK for Rwandan format (RAX 123 X style — 3 letters, 3 digits, 1
--     letter). Common spacing accepted; stored normalised uppercase.
--   * recompute_vehicle_verification extended: an expired required doc
--     flips the car to is_verified=false. Required set now includes the
--     insurance_certificate; inspection is warned-on-expiry but not
--     required to launch the pilot (tightenable later by admin flag).
--   * A daily "expiring soon" view for the driver dashboard banner.
--
-- Idempotent.

-- (A) new enum values
DO $$ BEGIN
  ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'insurance_certificate';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'inspection_certificate';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

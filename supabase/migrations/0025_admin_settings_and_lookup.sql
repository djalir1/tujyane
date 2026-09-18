-- 0025_admin_settings_and_lookup.sql
--
-- Admin surfaces: settings write RPCs + a unified lookup RPC that takes any
-- id (booking / journey / user / vehicle / plate) and returns the entity
-- description + bag of related rows.

-- =============================================================
-- 1) pricing_config: admin-only UPDATE. Client-side call convenience.
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_update_pricing_config(
  p_per_km_petrol   integer,
  p_per_km_diesel   integer,
  p_per_km_hybrid   integer,
  p_per_km_electric integer,
  p_min_contribution integer,
  p_adjust_band_pct  integer,
  p_bus_discount_pct integer
)
RETURNS public.pricing_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE row public.pricing_config;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_admin' USING errcode = '42501';
  END IF;

  UPDATE public.pricing_config
     SET per_km_petrol   = p_per_km_petrol,
         per_km_diesel   = p_per_km_diesel,
         per_km_hybrid   = p_per_km_hybrid,
         per_km_electric = p_per_km_electric,
         min_contribution = p_min_contribution,
         adjust_band_pct  = p_adjust_band_pct,
         bus_discount_pct = p_bus_discount_pct,
         updated_at = now()
   WHERE id = 1
  RETURNING * INTO row;

  PERFORM public.log_audit('admin.pricing_config.updated', 'pricing_config', NULL,
    jsonb_build_object('by', auth.uid()));
  RETURN row;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_pricing_config(integer,integer,integer,integer,integer,integer,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pricing_config(integer,integer,integer,integer,integer,integer,integer) TO authenticated;

-- =============================================================
-- 2) corridor_fares: admin sets/updates the bus fare for a corridor.
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_set_corridor_fare(
  p_origin_id uuid,
  p_destination_id uuid,
  p_bus_fare_rwf integer,
  p_notes text DEFAULT NULL
)
RETURNS public.corridor_fares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE row public.corridor_fares;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_admin' USING errcode = '42501';
  END IF;
  IF p_origin_id = p_destination_id THEN
    RAISE EXCEPTION 'same_origin_destination' USING errcode = 'P0001';
  END IF;

  INSERT INTO public.corridor_fares (origin_location_id, destination_location_id, bus_fare_rwf, notes, updated_at)
  VALUES (p_origin_id, p_destination_id, p_bus_fare_rwf, p_notes, now())
  ON CONFLICT (origin_location_id, destination_location_id) DO UPDATE
    SET bus_fare_rwf = EXCLUDED.bus_fare_rwf,
        notes        = EXCLUDED.notes,
        updated_at   = now()
  RETURNING * INTO row;

  PERFORM public.log_audit('admin.corridor_fare.set', 'corridor_fare', row.id,
    jsonb_build_object('origin', p_origin_id, 'destination', p_destination_id, 'bus_fare_rwf', p_bus_fare_rwf));
  RETURN row;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_corridor_fare(uuid,uuid,integer,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_corridor_fare(uuid,uuid,integer,text) TO authenticated;

-- =============================================================
-- 3) Reports: pilot-scope aggregates. Returns one JSON blob so a single RPC
--    powers the whole dashboard without N chatty calls.
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_reports_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'generated_at',   now(),
    'total_users',    (SELECT count(*) FROM public.profiles),
    'active_drivers', (SELECT count(*) FROM public.profiles WHERE is_verified_driver),
    'total_vehicles', (SELECT count(*) FROM public.vehicles),
    'verified_vehicles', (SELECT count(*) FROM public.vehicles WHERE is_verified),
    'total_journeys',   (SELECT count(*) FROM public.journeys),
    'active_journeys',  (SELECT count(*) FROM public.journeys WHERE status IN ('active','full','in_trip')),
    'total_bookings',   (SELECT count(*) FROM public.bookings),
    'completed_bookings',(SELECT count(*) FROM public.bookings WHERE status = 'completed'),
    'contribution_total_rwf', (SELECT COALESCE(sum(contribution_amount), 0)
                                 FROM public.bookings WHERE status = 'completed'),
    'contribution_avg_rwf',   (SELECT COALESCE(round(avg(contribution_amount))::int, 0)
                                 FROM public.bookings WHERE status = 'completed' AND contribution_amount IS NOT NULL),
    'verification_funnel', jsonb_build_object(
      'personal_submitted', (SELECT count(DISTINCT driver_id) FROM public.driver_documents
                              WHERE doc_type IN ('national_id','driving_license')
                                AND status IN ('pending','approved','rejected')),
      'personal_approved',  (SELECT count(*) FROM public.profiles WHERE is_verified_driver),
      'personal_rejected',  (SELECT count(DISTINCT driver_id) FROM public.driver_documents
                              WHERE doc_type IN ('national_id','driving_license') AND status = 'rejected'),
      'vehicles_submitted', (SELECT count(DISTINCT vehicle_id) FROM public.driver_documents
                              WHERE vehicle_id IS NOT NULL
                                AND status IN ('pending','approved','rejected')),
      'vehicles_approved',  (SELECT count(*) FROM public.vehicles WHERE is_verified)
    ),
    'rides_by_iso_week', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('week', week, 'rides', c) ORDER BY week DESC), '[]'::jsonb)
        FROM (
          SELECT to_char(date_trunc('week', departure_time), 'IYYY-"W"IW') AS week,
                 count(*) AS c
            FROM public.journeys
           WHERE status IN ('completed','in_trip','full','active')
           GROUP BY 1
           ORDER BY 1 DESC
           LIMIT 8
        ) t
    )
  );
$$;
REVOKE ALL ON FUNCTION public.admin_reports_summary() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reports_summary() TO authenticated;

-- =============================================================
-- 4) Global lookup — resolve one string (uuid, or plate) into the entity(ies)
--    it identifies, returning enough related data for the admin detail view.
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_lookup(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_query text := btrim(p_query);
  v_plate text;
  v_json jsonb := '[]'::jsonb;
  v_row jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_admin' USING errcode = '42501';
  END IF;
  IF v_query IS NULL OR v_query = '' THEN RETURN v_json; END IF;

  -- UUID branch: try each entity table with that id.
  BEGIN
    v_uid := v_query::uuid;
    -- Booking?
    SELECT jsonb_build_object(
      'kind', 'booking',
      'booking', to_jsonb(b),
      'journey', to_jsonb(j),
      'passenger', to_jsonb(pp),
      'driver', to_jsonb(pd),
      'vehicle', to_jsonb(v)
    ) INTO v_row
    FROM public.bookings b
    LEFT JOIN public.journeys j ON j.id = b.journey_id
    LEFT JOIN public.profiles pp ON pp.id = b.passenger_id
    LEFT JOIN public.profiles pd ON pd.id = j.driver_id
    LEFT JOIN public.vehicles v ON v.id = j.vehicle_id
    WHERE b.id = v_uid;
    IF v_row IS NOT NULL THEN v_json := v_json || v_row; END IF;

    -- Journey?
    SELECT jsonb_build_object(
      'kind', 'journey',
      'journey', to_jsonb(j),
      'driver', to_jsonb(pd),
      'vehicle', to_jsonb(v),
      'bookings', COALESCE((SELECT jsonb_agg(to_jsonb(b))
                              FROM public.bookings b WHERE b.journey_id = j.id), '[]'::jsonb)
    ) INTO v_row
    FROM public.journeys j
    LEFT JOIN public.profiles pd ON pd.id = j.driver_id
    LEFT JOIN public.vehicles v ON v.id = j.vehicle_id
    WHERE j.id = v_uid;
    IF v_row IS NOT NULL THEN v_json := v_json || v_row; END IF;

    -- User (profile)?
    SELECT jsonb_build_object(
      'kind', 'user',
      'profile', to_jsonb(p),
      'email', (SELECT email FROM auth.users WHERE id = p.id),
      'vehicles', COALESCE((SELECT jsonb_agg(to_jsonb(v))
                              FROM public.vehicles v WHERE v.owner_id = p.id), '[]'::jsonb),
      'journeys_count', (SELECT count(*) FROM public.journeys WHERE driver_id = p.id),
      'bookings_count', (SELECT count(*) FROM public.bookings WHERE passenger_id = p.id)
    ) INTO v_row
    FROM public.profiles p
    WHERE p.id = v_uid;
    IF v_row IS NOT NULL THEN v_json := v_json || v_row; END IF;

    -- Vehicle?
    SELECT jsonb_build_object(
      'kind', 'vehicle',
      'vehicle', to_jsonb(v),
      'owner', to_jsonb(p),
      'documents', COALESCE((SELECT jsonb_agg(to_jsonb(d))
                               FROM public.driver_documents d WHERE d.vehicle_id = v.id), '[]'::jsonb),
      'journeys_count', (SELECT count(*) FROM public.journeys WHERE vehicle_id = v.id)
    ) INTO v_row
    FROM public.vehicles v
    LEFT JOIN public.profiles p ON p.id = v.owner_id
    WHERE v.id = v_uid;
    IF v_row IS NOT NULL THEN v_json := v_json || v_row; END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    -- Not a UUID — plate lookup path.
    v_plate := upper(regexp_replace(v_query, '\s+', ' ', 'g'));
    SELECT jsonb_build_object(
      'kind', 'vehicle',
      'vehicle', to_jsonb(v),
      'owner', to_jsonb(p),
      'documents', COALESCE((SELECT jsonb_agg(to_jsonb(d))
                               FROM public.driver_documents d WHERE d.vehicle_id = v.id), '[]'::jsonb),
      'journeys_count', (SELECT count(*) FROM public.journeys WHERE vehicle_id = v.id)
    ) INTO v_row
    FROM public.vehicles v
    LEFT JOIN public.profiles p ON p.id = v.owner_id
    WHERE upper(regexp_replace(v.plate_number, '\s+', '', 'g')) = upper(regexp_replace(v_plate, '\s+', '', 'g'));
    IF v_row IS NOT NULL THEN v_json := v_json || v_row; END IF;

    -- Also allow email lookup for user search.
    IF v_query ~ '@' THEN
      SELECT jsonb_build_object(
        'kind', 'user',
        'profile', to_jsonb(p),
        'email', u.email,
        'vehicles', COALESCE((SELECT jsonb_agg(to_jsonb(v))
                                FROM public.vehicles v WHERE v.owner_id = p.id), '[]'::jsonb),
        'journeys_count', (SELECT count(*) FROM public.journeys WHERE driver_id = p.id),
        'bookings_count', (SELECT count(*) FROM public.bookings WHERE passenger_id = p.id)
      ) INTO v_row
      FROM auth.users u
      JOIN public.profiles p ON p.id = u.id
      WHERE lower(u.email) = lower(v_query);
      IF v_row IS NOT NULL THEN v_json := v_json || v_row; END IF;
    END IF;
  END;

  RETURN v_json;
END $$;
REVOKE ALL ON FUNCTION public.admin_lookup(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_lookup(text) TO authenticated;

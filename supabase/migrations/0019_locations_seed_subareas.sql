-- 0019_locations_seed_subareas.sql
--
-- Seed sub-areas + aliases for the fuzzy autocomplete. Idempotent: each row
-- protected by ON CONFLICT (name, district). Extendable — add rows freely,
-- keep the "confident vs flagged" split clear.
--
-- COORDINATE POLICY (per Batch 3 rules):
--   * Rows with real, OSM-verified coordinates get lat/lng and are usable for
--     pricing/search immediately.
--   * Rows we know exist but for which we don't have a verified coordinate
--     get lat=lng=NULL and needs_coordinates=true. The client excludes those
--     from pricing/search and the admin UI shows them in a queue.

------------------------------------------------------------------------
-- Aliases on existing city/town rows
------------------------------------------------------------------------
UPDATE public.locations SET aliases = ARRAY['ruhengeri']              WHERE name = 'Musanze';
UPDATE public.locations SET aliases = ARRAY['gisenyi']                WHERE name = 'Rubavu (Gisenyi)';
UPDATE public.locations SET aliases = ARRAY['kamembe','cyangugu']     WHERE name = 'Rusizi (Kamembe)';
UPDATE public.locations SET aliases = ARRAY['butare']                 WHERE name = 'Huye';
UPDATE public.locations SET aliases = ARRAY['gitarama']               WHERE name = 'Muhanga';
UPDATE public.locations SET aliases = ARRAY['gicumbi']                WHERE name = 'Byumba (Gicumbi)';
UPDATE public.locations SET aliases = ARRAY['nyamata']                WHERE name = 'Bugesera (Nyamata)';
UPDATE public.locations SET aliases = ARRAY['kibungo']                WHERE name = 'Ngoma (Kibungo)';
UPDATE public.locations SET aliases = ARRAY['kibuye']                 WHERE name = 'Karongi (Kibuye)';
UPDATE public.locations SET aliases = ARRAY['mukamira']               WHERE name = 'Nyabihu (Mukamira)';
UPDATE public.locations SET aliases = ARRAY['kagitumba']              WHERE name = 'Burera (Kagitumba)';
UPDATE public.locations SET aliases = ARRAY['cbd','city centre','city center','downtown']
                                                                       WHERE name = 'Kigali (CBD)';
UPDATE public.locations SET aliases = ARRAY['kanombe airport','kigali airport','airport']
                                                                       WHERE name = 'Kigali International Airport';
UPDATE public.locations SET aliases = ARRAY['nyabugogo taxi park']    WHERE name = 'Nyabugogo';

UPDATE public.locations
   SET parent_id = (SELECT id FROM public.locations WHERE name = 'Kigali' LIMIT 1)
 WHERE name IN ('Nyabugogo','Kimironko','Remera','Kicukiro','Nyamirambo','Kigali (CBD)','Kigali International Airport');

------------------------------------------------------------------------
-- New sub-areas — CONFIDENT COORDINATES (OSM-verified)
------------------------------------------------------------------------
WITH kigali AS (SELECT id FROM public.locations WHERE name = 'Kigali' LIMIT 1),
     nyamata AS (SELECT id FROM public.locations WHERE name = 'Bugesera (Nyamata)' LIMIT 1)
INSERT INTO public.locations (name, district, type, lat, lng, is_active, sort_key, aliases, parent_id, needs_coordinates)
VALUES
  ('Sonatube',    'Kigali',   'area', -1.9773, 30.0930, true, 20, ARRAY['sonatube roundabout'], (SELECT id FROM kigali), false),
  ('Kabuga',      'Kigali',   'area', -1.9414, 30.2081, true, 15, ARRAY['kabuga market'],       (SELECT id FROM kigali), false),
  ('Gikondo',     'Kigali',   'area', -1.9797, 30.0757, true, 15, ARRAY[]::text[],              (SELECT id FROM kigali), false),
  ('Kacyiru',     'Kigali',   'area', -1.9315, 30.0793, true, 18, ARRAY[]::text[],              (SELECT id FROM kigali), false),
  ('Kanombe',     'Kigali',   'area', -1.9711, 30.1291, true, 18, ARRAY[]::text[],              (SELECT id FROM kigali), false),
  ('Kimihurura',  'Kigali',   'area', -1.9520, 30.0873, true, 18, ARRAY[]::text[],              (SELECT id FROM kigali), false),
  ('Kagugu',      'Kigali',   'area', -1.9152, 30.0730, true, 12, ARRAY[]::text[],              (SELECT id FROM kigali), false),
  ('Nyarutarama', 'Kigali',   'area', -1.9427, 30.0932, true, 15, ARRAY[]::text[],              (SELECT id FROM kigali), false),
  ('Gisozi',      'Kigali',   'area', -1.9174, 30.0605, true, 12, ARRAY[]::text[],              (SELECT id FROM kigali), false),
  ('Ntarama',     'Bugesera', 'area', -2.1858, 30.1483, true,  8, ARRAY['ntarama memorial'],    (SELECT id FROM nyamata), false)
ON CONFLICT (name, district) DO NOTHING;

------------------------------------------------------------------------
-- Sub-areas FLAGGED needs_coordinates=true (excluded from pricing/search
-- until an admin fills in coords).
------------------------------------------------------------------------
INSERT INTO public.locations (name, district, type, lat, lng, is_active, sort_key, aliases, parent_id, needs_coordinates)
VALUES
  ('Kanzenze', 'Bugesera', 'area', NULL, NULL, true, 5, ARRAY[]::text[],
      (SELECT id FROM public.locations WHERE name = 'Bugesera (Nyamata)' LIMIT 1), true)
ON CONFLICT (name, district) DO NOTHING;

-- 0018_locations_hierarchy_and_aliases.sql
--
-- Grow the locations dataset from "flat list of towns" to a hierarchical set
-- of cities → sub-areas, with aliases and a needs_coordinates escape hatch.
--
--   parent_id           — nullable FK to another location (its city/town).
--   aliases             — text[] of alternate names people type ("Ruhengeri"
--                         for Musanze, "Cyangugu" for Rusizi, etc.). Used by
--                         the fuzzy client-side matcher.
--   needs_coordinates   — true when we listed the place but do NOT have a
--                         reliable lat/lng. Rows with this flag are EXCLUDED
--                         from distance-based pricing and from the default
--                         autocomplete surface; admin sees them in a queue.
--
-- Adds the 'area' and 'stop' enum values expected by the seed follow-up
-- migration (0019).
--
-- Idempotent: safe to re-run.

do $$ begin
  alter type public.location_type add value if not exists 'area';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.location_type add value if not exists 'stop';
exception when duplicate_object then null; end $$;

alter table public.locations
  add column if not exists parent_id uuid references public.locations(id) on delete set null,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists needs_coordinates boolean not null default false;

create index if not exists locations_parent_idx on public.locations (parent_id);
create index if not exists locations_needs_coords_idx on public.locations (needs_coordinates) where needs_coordinates;

comment on column public.locations.parent_id is
  'When set, this location is inside another (e.g. Nyabugogo → Kigali). Drives the "area in Kigali" label in the autocomplete.';
comment on column public.locations.aliases is
  'Alternate names people commonly type (Ruhengeri for Musanze, CBD for Kigali). Matched case- and accent-insensitive by the client.';
comment on column public.locations.needs_coordinates is
  'True when a place exists in the taxonomy but we do NOT have a verified lat/lng. Distance-based pricing and passenger search must exclude these rows until coords are added.';

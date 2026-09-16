import { supabase } from '@/lib/supabase';
import type { PricingConfig } from '@/lib/pricing';

export type LocationType = 'city' | 'town' | 'area' | 'node' | 'stop' | 'border' | 'international';

export type Location = {
  id: string;
  name: string;
  district: string | null;
  type: LocationType;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  sort_key: number;
  /** When set, this location lives inside another (Nyabugogo → Kigali). Used
   * to render "area in Kigali" and to indent sub-areas under their parent. */
  parent_id: string | null;
  /** Alternate names users commonly type. Empty for most rows. */
  aliases: string[];
  /** True when the row exists but has NO verified coordinate. Excluded from
   * distance-based pricing and from user-facing autocomplete. */
  needs_coordinates: boolean;
};

/**
 * Cached parent-name lookup so labels can render "area in Kigali" without a
 * join. Populated by listLocations and consumed by locationLabel.
 */
let parentNameById: Map<string, string> = new Map();

export function locationLabel(l: Location): string {
  // Prefer the parent-name relationship when we know it; otherwise fall back
  // to the legacy `district` column so old rows still render nicely.
  const parentName = l.parent_id ? parentNameById.get(l.parent_id) : undefined;
  if (parentName) {
    if (l.type === 'stop') return `${l.name} — stop in ${parentName}`;
    return `${l.name} — area in ${parentName}`;
  }
  if (!l.district || l.district === l.name) return l.name;
  if (l.type === 'node' || l.type === 'area') return `${l.name} — area in ${l.district}`;
  if (l.type === 'stop') return `${l.name} — stop in ${l.district}`;
  if (l.type === 'border') return `${l.name} — border · ${l.district}`;
  if (l.type === 'international') return `${l.name} — international`;
  return `${l.name} — ${l.district}`;
}

/** Human-friendly badge text for a location type. Used by CityAutocomplete. */
export function locationTypeBadge(type: LocationType): string {
  switch (type) {
    case 'city':          return 'City';
    case 'town':          return 'Town';
    case 'area':
    case 'node':          return 'Area';
    case 'stop':          return 'Stop';
    case 'border':        return 'Border';
    case 'international': return 'Intl';
  }
}

/**
 * Fetches every active location once. Excludes rows with needs_coordinates=true
 * from the user-facing list — those cannot participate in pricing.
 */
let cache: Promise<Location[]> | null = null;
export function listLocations(): Promise<Location[]> {
  if (cache) return cache;
  const p = (async () => {
    const { data, error } = await supabase
      .from('locations')
      .select('id,name,district,type,lat,lng,is_active,sort_key,parent_id,aliases,needs_coordinates')
      .eq('is_active', true)
      .eq('needs_coordinates', false)
      .order('sort_key', { ascending: false })
      .order('name', { ascending: true });
    if (error) { cache = null; throw error; }
    const rows = (data ?? []) as Location[];
    // Rebuild parent-name lookup so labels are consistent everywhere.
    parentNameById = new Map(rows.map((r) => [r.id, r.name]));
    return rows;
  })();
  cache = p;
  p.catch(() => { cache = null; });
  return p;
}
/** Testing hook. */
export function invalidateLocationsCache() { cache = null; parentNameById = new Map(); }

/** Fetch the single-row pricing config. */
export async function loadPricingConfig(): Promise<PricingConfig> {
  const { data, error } = await supabase
    .from('pricing_config')
    .select('per_km_petrol,per_km_diesel,per_km_hybrid,per_km_electric,min_contribution,adjust_band_pct,bus_discount_pct')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Pricing config missing.');
  const row = data as Partial<PricingConfig> & { bus_discount_pct?: number | null };
  // Older DBs won't have bus_discount_pct yet — default to 20% cheaper than
  // the bus when a corridor reference exists.
  return {
    per_km_petrol:   row.per_km_petrol   ?? 120,
    per_km_diesel:   row.per_km_diesel   ?? 100,
    per_km_hybrid:   row.per_km_hybrid   ?? 80,
    per_km_electric: row.per_km_electric ?? 55,
    min_contribution: row.min_contribution ?? 500,
    adjust_band_pct:  row.adjust_band_pct  ?? 10,
    bus_discount_pct: row.bus_discount_pct ?? 20,
  };
}

/**
 * Bus-fare corridor references. When a matching row exists for a corridor,
 * pricing uses the bus fare as a hard ceiling (see src/lib/pricing.ts).
 */
export type CorridorFare = {
  origin_location_id: string;
  destination_location_id: string;
  bus_fare_rwf: number | null;
};

let corridorFaresCache: Promise<CorridorFare[]> | null = null;
export function listCorridorFares(): Promise<CorridorFare[]> {
  if (corridorFaresCache) return corridorFaresCache;
  const p = (async () => {
    const { data, error } = await supabase
      .from('corridor_fares')
      .select('origin_location_id,destination_location_id,bus_fare_rwf');
    if (error) { corridorFaresCache = null; throw error; }
    return (data ?? []) as CorridorFare[];
  })();
  corridorFaresCache = p;
  p.catch(() => { corridorFaresCache = null; });
  return p;
}
export function invalidateCorridorFaresCache() { corridorFaresCache = null; }

/** Find a bus-fare reference for a specific corridor (either direction). */
export function findCorridorFare(
  fares: CorridorFare[],
  originId: string | null | undefined,
  destinationId: string | null | undefined,
): number | null {
  if (!originId || !destinationId) return null;
  const hit = fares.find((f) =>
    (f.origin_location_id === originId && f.destination_location_id === destinationId) ||
    (f.origin_location_id === destinationId && f.destination_location_id === originId),
  );
  return hit?.bus_fare_rwf ?? null;
}

/**
 * Accent- and case-insensitive normaliser. Rwandan names include French/
 * Kinyarwanda characters — normalising to NFD strips diacritics so "Musanze"
 * matches "musanze", "MUSANZE", and "muşanze".
 */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Cheap Levenshtein edit distance capped at `max` so we can bail early on
 * strings that are obviously too different. Good enough for the ~50-row
 * autocomplete without touching a native lib.
 */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1; // early-exit: whole row past the cap
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

export type SearchHit = {
  location: Location;
  score: number;      // higher is better
  match: 'exact' | 'prefix' | 'alias' | 'substring' | 'district' | 'fuzzy';
};

/**
 * Rank locations against the query. Rules (highest → lowest):
 *   exact name / alias         → 1000
 *   name prefix                → 800 − length
 *   alias prefix               → 750
 *   name contains              → 500
 *   alias contains             → 480
 *   district contains          → 300
 *   fuzzy (Levenshtein ≤ tol)  → 200 − distance*10  (tol scales with query)
 *
 * Ties broken by sort_key then alphabetical. Fuzzy tolerance is 1 for very
 * short queries, 2 for medium, 3 for long — protects against "any 3-char
 * query matches everything."
 */
export function rankLocations(all: Location[], rawQuery: string, limit = 8): SearchHit[] {
  const q = normalise(rawQuery);
  if (!q) return all.slice(0, limit).map((l) => ({ location: l, score: l.sort_key, match: 'prefix' }));

  const tol = q.length < 4 ? 1 : q.length < 7 ? 2 : 3;
  const hits: SearchHit[] = [];

  for (const l of all) {
    const name = normalise(l.name);
    const district = normalise(l.district ?? '');
    const aliases = (l.aliases ?? []).map(normalise);

    let score = -1;
    let match: SearchHit['match'] = 'fuzzy';

    if (name === q || aliases.includes(q))          { score = 1000; match = 'exact'; }
    else if (name.startsWith(q))                    { score = 800 - Math.min(name.length, 40); match = 'prefix'; }
    else if (aliases.some((a) => a.startsWith(q)))  { score = 750; match = 'alias'; }
    else if (name.includes(q))                      { score = 500; match = 'substring'; }
    else if (aliases.some((a) => a.includes(q)))    { score = 480; match = 'alias'; }
    else if (district.includes(q))                  { score = 300; match = 'district'; }
    else {
      // Fuzzy fallback — try name and each alias, take the best.
      let best = tol + 1;
      const targets = [name, ...aliases];
      for (const t of targets) {
        // Skip huge length differences (Levenshtein handles this too).
        if (Math.abs(t.length - q.length) > tol) continue;
        const d = levenshtein(t, q, tol);
        if (d < best) best = d;
        if (best === 0) break;
      }
      if (best <= tol) {
        score = 200 - best * 10;
        match = 'fuzzy';
      }
    }

    if (score < 0) continue;
    hits.push({ location: l, score: score + l.sort_key * 0.1, match });
  }

  hits.sort((a, b) => b.score - a.score || a.location.name.localeCompare(b.location.name));
  return hits.slice(0, limit);
}

/** Backwards-compatible wrapper — same signature the old CityAutocomplete used. */
export function filterLocations(all: Location[], query: string, limit = 8): Location[] {
  return rankLocations(all, query, limit).map((h) => h.location);
}

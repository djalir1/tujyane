/**
 * Pricing: the single source of truth for suggested per-seat contributions.
 *
 * Batch-3 rework:
 *   * Per-km baseline    = (distance × per_km_rate[energy]) / seats
 *   * If a bus-fare reference exists for the corridor:
 *       target = bus_fare × (1 − bus_discount_pct/100)
 *       suggested = round( min(baseline, target) )
 *     Otherwise:
 *       suggested = round( baseline )
 *   * Floor at cfg.min_contribution so tiny trips are still fair to the driver.
 *   * Driver may adjust ±adjust_band_pct% of suggested — AND the final value
 *     must NEVER exceed the bus fare when a reference exists (hard cap; the
 *     server enforces the same cap via enforce_contribution_band).
 *
 * Kept as pure functions — no I/O, config is passed in — so it can be unit-
 * tested and centrally tuned by the platform.
 */
export type EnergyType = 'petrol' | 'diesel' | 'hybrid' | 'electric';

export type PricingConfig = {
  per_km_petrol:   number;
  per_km_diesel:   number;
  per_km_hybrid:   number;
  per_km_electric: number;
  min_contribution: number;
  adjust_band_pct:  number;   // e.g. 10  = ±10%
  bus_discount_pct: number;   // e.g. 20  = suggested is 20% cheaper than bus
};

export type LatLng = { lat: number; lng: number };

/** Great-circle (haversine) distance in kilometres. Good enough for V1. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function ratePerKm(cfg: PricingConfig, energy: EnergyType): number {
  switch (energy) {
    case 'petrol':   return cfg.per_km_petrol;
    case 'diesel':   return cfg.per_km_diesel;
    case 'hybrid':   return cfg.per_km_hybrid;
    case 'electric': return cfg.per_km_electric;
  }
}

/** Round to a friendlier number (nearest 100 RWF) so drivers don't see "3,247". */
function roundToStep(v: number, step = 100): number {
  return Math.max(0, Math.round(v / step) * step);
}

export type PricingBreakdown = {
  distanceKm: number;
  energy: EnergyType;
  seats: number;
  perKm: number;
  rawPerSeat: number;              // (distance × perKm) / seats
  suggested: number;               // rounded, floored, capped
  min: number;
  low: number;                     // driver adjust floor (band + min)
  high: number;                    // driver adjust ceiling (band + hard cap)
  band: number;                    // percent
  busFare: number | null;          // corridor bus fare, if known
  busDiscountPct: number;          // discount target
  cappedByBus: boolean;            // true when the bus discount pulled suggested below the per-km baseline
  hardCap: number | null;          // hard ceiling = busFare, if set
};

export type ComputeSuggestedInput = {
  cfg: PricingConfig;
  origin: LatLng;
  destination: LatLng;
  energy: EnergyType;
  seatsTotal: number;
  /** Optional bus-fare reference (RWF per seat, one-way). When present, the
   * result is discounted to `busFare * (1 - bus_discount_pct/100)` if that's
   * below the per-km baseline. */
  busFare?: number | null;
};

export function computeSuggested(input: ComputeSuggestedInput): PricingBreakdown {
  const { cfg, origin: from, destination: to, energy: e, seatsTotal: seatsIn, busFare: bf } = input;

  const distanceKm = haversineKm(from, to);
  const perKm      = ratePerKm(cfg, e);
  const seats      = Math.max(1, seatsIn);
  const rawPerSeat = (distanceKm * perKm) / seats;

  // Bus discount target — only applies when a corridor reference exists.
  const busTarget = bf != null && bf > 0
    ? bf * (1 - cfg.bus_discount_pct / 100)
    : null;

  // Suggested is the CHEAPER of per-km baseline and bus discount target
  // (never let the algorithm produce a price that's not visibly cheaper than
  // the bus). Floor at min_contribution so short trips stay fair to driver.
  const pickedRaw = busTarget != null ? Math.min(rawPerSeat, busTarget) : rawPerSeat;
  const suggested = Math.max(cfg.min_contribution, roundToStep(pickedRaw, 100));

  const band = cfg.adjust_band_pct;
  const bandLow  = Math.floor(suggested * (1 - band / 100));
  const bandHigh = Math.ceil(suggested * (1 + band / 100));
  const low = Math.max(cfg.min_contribution, bandLow);
  // Hard cap at bus fare when reference exists — the ±band cannot push over it.
  const high = bf != null && bf > 0 ? Math.min(bandHigh, bf) : bandHigh;

  return {
    distanceKm,
    energy: e,
    seats,
    perKm,
    rawPerSeat,
    suggested,
    min: cfg.min_contribution,
    low,
    high,
    band,
    busFare: bf ?? null,
    busDiscountPct: cfg.bus_discount_pct,
    cappedByBus: busTarget != null && busTarget < rawPerSeat,
    hardCap: bf != null && bf > 0 ? bf : null,
  };
}

/** True when the driver's chosen contribution is inside the config band AND under the bus fare. */
export function withinBand(brk: PricingBreakdown, choice: number): boolean {
  if (choice < brk.low || choice > brk.high) return false;
  if (brk.hardCap != null && choice > brk.hardCap) return false;
  return true;
}

/** Human-readable line for the driver's confirmation card. */
export function breakdownLine(brk: PricingBreakdown): string {
  const km = brk.distanceKm.toFixed(brk.distanceKm < 20 ? 1 : 0);
  const base = `Based on ~${km} km, ${brk.energy} rate ${brk.perKm} RWF/km, split over ${brk.seats} seat${brk.seats > 1 ? 's' : ''}.`;
  if (brk.cappedByBus && brk.busFare != null) {
    return `${base} About ${brk.busDiscountPct}% cheaper than the bus (RF ${formatNumber(brk.busFare)}).`;
  }
  if (brk.busFare != null) {
    // We have a reference but per-km was already below the target — still
    // reassure the driver we compared against the bus.
    return `${base} Bus reference: RF ${formatNumber(brk.busFare)}.`;
  }
  return base;
}

/** Short passenger-facing chip text, or null when no bus reference exists. */
export function busComparisonChip(brk: PricingBreakdown | null | undefined): string | null {
  if (!brk?.busFare || !brk?.suggested) return null;
  const cheaper = brk.busFare - brk.suggested;
  if (cheaper <= 0) return null;
  const pct = Math.round((cheaper / brk.busFare) * 100);
  return `Cheaper than the bus · save ~${pct}%`;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

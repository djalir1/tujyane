/**
 * Central validation layer for TUJYANE — the single place client-side rules
 * live. The DB enforces the same rules via triggers/RLS (see supabase
 * migrations 0012, 0016, 0021, 0022). This module exports pure functions so
 * they can be unit-tested and reused across forms + guards.
 *
 * WHY DUPLICATE THE RULES CLIENT-SIDE:
 *   The server is authoritative. But hitting the DB and translating an
 *   opaque error into a friendly message is a bad UX for things we can
 *   catch cheaply on-device (dates in the past, seats over capacity). We
 *   also want to disable submit buttons when the state can't possibly pass
 *   the server rules.
 *
 * SERVER ↔ CLIENT ENFORCEMENT MATRIX
 * ────────────────────────────────────────────────────────────────────────
 * Rule                                    | Client | Server
 * ────────────────────────────────────────|--------|-----------------------
 * departure_time strictly future          |   ✓    | ✓  guard_journey_departure_future (0022)
 * seats_total <= vehicle.seats            |   ✓    | ✓  guard_journey_seats_capacity (0022)
 * seats_total 1..vehicle.seats            |   ✓    | ✓  CHECK on journeys + guard_journey_seats_capacity
 * only verified driver may INSERT         |   ✓    | ✓  guard_journey_insert_verified (0016)
 * only verified vehicle may INSERT        |   ✓    | ✓  guard_journey_insert_verified (0016)
 * vehicle.owner_id == driver_id           |   ✓    | ✓  guard_journey_insert_verified (0016)
 * one active/in-progress trip per vehicle | (nice) | ✓  guard_journey_one_active_per_vehicle (0022)
 * contribution within ±10% of suggested   |   ✓    | ✓  enforce_contribution_band (0012)
 * contribution <= bus_fare when known     |   ✓    | ✓  enforce_contribution_band (0020)
 * start_trip only at/after departure_time |   ✓    | ✓  start_trip RPC (0022)
 * ────────────────────────────────────────────────────────────────────────
 */

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

const ok: ValidationResult = { ok: true };
const err = (code: string, message: string): ValidationResult => ({ ok: false, code, message });

/* ── Departure time ───────────────────────────────────────────────────── */

/** Reject a departure time that isn't strictly in the future. A 30-second
 * grace window covers clock skew between the browser and the DB. */
export function validateDepartureTime(dt: Date | null): ValidationResult {
  if (!dt) return err('departure_required', 'Pick a departure date and time.');
  const now = Date.now() - 30_000;
  if (dt.getTime() <= now) return err('departure_past', 'Departure must be in the future.');
  return ok;
}

/** For starting the trip (transition to in_trip): only permitted at or after
 * the departure_time. Small grace window before is a UX call — we say NO
 * before departure to match the DB. */
export function canStartTrip(departure: Date): ValidationResult {
  if (Date.now() < departure.getTime()) {
    const minutes = Math.ceil((departure.getTime() - Date.now()) / 60_000);
    return err(
      'trip_not_yet_startable',
      `Departure is in ${minutes} minute${minutes === 1 ? '' : 's'}. You can start the trip at or after the scheduled time.`,
    );
  }
  return ok;
}

/* ── Seats ────────────────────────────────────────────────────────────── */

export function validateSeats(seats: number, vehicleCapacity: number | null | undefined): ValidationResult {
  if (!Number.isFinite(seats) || seats < 1) return err('seats_min', 'Seats must be at least 1.');
  if (seats > 7)                              return err('seats_max', 'Seats must be at most 7.');
  if (vehicleCapacity != null && seats > vehicleCapacity) {
    return err('seats_over_capacity', `That car only has ${vehicleCapacity} seat${vehicleCapacity === 1 ? '' : 's'}.`);
  }
  return ok;
}

/* ── Vehicle plate ────────────────────────────────────────────────────── */

/** Rwandan civilian plates are three letters + three digits + one letter,
 * with optional single spaces between the parts (e.g. RAB 123 A, rab123a).
 * We normalise to uppercase with no internal doubled whitespace. */
export function normalisePlate(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toUpperCase();
}

const PLATE_RE = /^[A-Z]{3} ?[0-9]{3} ?[A-Z]$/;

export function validatePlate(raw: string): ValidationResult {
  const p = normalisePlate(raw);
  if (!p) return err('plate_required', 'Plate number is required.');
  if (!PLATE_RE.test(p)) {
    return err('plate_format', 'Use the Rwandan plate format, e.g. RAB 123 A.');
  }
  return ok;
}

/* ── Aggregate helpers ────────────────────────────────────────────────── */

/** Roll a set of results into the first failure, or ok. */
export function firstError(...results: ValidationResult[]): ValidationResult {
  for (const r of results) if (!r.ok) return r;
  return ok;
}

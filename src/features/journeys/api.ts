import { supabase } from '@/lib/supabase';
import type { EnergyType } from '@/features/vehicles/api';

export type JourneyStatus = 'active' | 'full' | 'cancelled' | 'completed';
export type Recurrence = 'once' | 'daily' | 'weekdays' | 'weekends' | 'weekly';

export type JourneyRow = {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  origin_location_id: string | null;
  destination_location_id: string | null;
  origin_text: string;
  destination_text: string;
  distance_km: number | null;
  departure_time: string; // ISO
  recurrence: Recurrence;
  seats_total: number;
  seats_available: number;
  suggested_contribution: number;
  contribution_per_seat: number | null;
  luggage_allowed: boolean;
  pets_allowed: boolean;
  smoking_allowed: boolean;
  women_only: boolean;
  notes: string | null;
  status: JourneyStatus;
  created_at: string;
};

/** For legacy rows without contribution_per_seat, fall back to suggested. */
export function contributionOf(j: { contribution_per_seat: number | null; suggested_contribution: number }): number {
  return j.contribution_per_seat ?? j.suggested_contribution;
}

export type JoinedDriver = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  rating_avg: number;
  rating_count: number;
  is_verified_driver: boolean;
};

export type JoinedVehicle = {
  id: string;
  make: string;
  model: string;
  year: number | null;
  energy_type: EnergyType;
  is_verified: boolean;
  photo_url: string | null;
};

export type JourneyWithJoins = JourneyRow & {
  driver: JoinedDriver | null;
  vehicle: JoinedVehicle | null;
};

// Re-export so callers don't have to remember the module.
export type { EnergyType } from '@/features/vehicles/api';

const JOURNEY_JOIN_COLS = `
  id, driver_id, vehicle_id,
  origin_location_id, destination_location_id, distance_km,
  origin_text, destination_text,
  departure_time, recurrence,
  seats_total, seats_available,
  suggested_contribution, contribution_per_seat,
  luggage_allowed, pets_allowed, smoking_allowed, women_only,
  notes, status, created_at,
  driver:profiles!journeys_driver_id_fkey ( id, full_name, avatar_url, rating_avg, rating_count, is_verified_driver ),
  vehicle:vehicles!journeys_vehicle_id_fkey ( id, make, model, year, energy_type, is_verified, photo_url )
`;

export type SearchInput = {
  fromLocationId: string | null;
  toLocationId: string | null;
  fromText?: string;      // fallback text (legacy or free-text corridor)
  toText?: string;
  date: Date | null;
  passengers: number;
  /** Optional filters passed from the results page. */
  energyTypes?: EnergyType[];
  timeOfDay?: 'any' | 'morning' | 'afternoon' | 'evening';
};

export type SortMode = 'earliest' | 'cheapest';

export type SearchDateMode = 'day' | 'from';

export async function searchJourneys(
  input: SearchInput,
  opts?: { dateMode?: SearchDateMode; sort?: SortMode },
): Promise<JourneyWithJoins[]> {
  const now = new Date();
  const dateMode = opts?.dateMode ?? 'from';
  const dayStart = input.date ? atMidnight(input.date) : now;
  const lower = dayStart > now ? dayStart : now;
  const upper = dateMode === 'day' && input.date ? atEndOfDay(input.date) : null;

  let q = supabase
    .from('journeys')
    .select(JOURNEY_JOIN_COLS)
    .eq('status', 'active')
    .gte('seats_available', input.passengers)
    .gte('departure_time', lower.toISOString())
    .order('departure_time', { ascending: true })
    .limit(100);

  if (upper) q = q.lte('departure_time', upper.toISOString());

  // Precise location filter when the user picked from the autocomplete.
  if (input.fromLocationId) q = q.eq('origin_location_id', input.fromLocationId);
  else if (input.fromText?.trim()) q = q.ilike('origin_text', `%${input.fromText.trim()}%`);

  if (input.toLocationId) q = q.eq('destination_location_id', input.toLocationId);
  else if (input.toText?.trim()) q = q.ilike('destination_text', `%${input.toText.trim()}%`);

  const { data, error } = await q;
  if (error) {
    // Bubble up with real context so the toast/onError handler can log the
    // actual Supabase message (PostgREST hint, code, details) instead of a
    // generic "Search failed". No search page benefits from a stack trace of
    // "TypeError: undefined" — the DB error message is the diagnostic.
    // eslint-disable-next-line no-console
    console.error('[search] supabase returned error', {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
      filters: {
        fromLocationId: input.fromLocationId, toLocationId: input.toLocationId,
        passengers: input.passengers, lower: lower.toISOString(),
      },
    });
    throw new Error(error.message || 'Search failed.');
  }

  let rows = (data ?? []) as unknown as JourneyWithJoins[];

  // Post-filters that Supabase can't easily express in one query.
  if (input.energyTypes && input.energyTypes.length > 0) {
    rows = rows.filter((r) => r.vehicle && input.energyTypes!.includes(r.vehicle.energy_type));
  }
  if (input.timeOfDay && input.timeOfDay !== 'any') {
    const tod = input.timeOfDay as 'morning' | 'afternoon' | 'evening';
    rows = rows.filter((r) => matchesTimeOfDay(r.departure_time, tod));
  }

  if (opts?.sort === 'cheapest') {
    rows = rows.slice().sort((a, b) => {
      const ca = a.contribution_per_seat ?? a.suggested_contribution;
      const cb = b.contribution_per_seat ?? b.suggested_contribution;
      return ca - cb;
    });
  }

  return rows;
}

function matchesTimeOfDay(iso: string, tod: 'morning' | 'afternoon' | 'evening'): boolean {
  const h = new Date(iso).getHours();
  if (tod === 'morning')   return h >= 4  && h < 12;
  if (tod === 'afternoon') return h >= 12 && h < 17;
  return h >= 17 || h < 4; // evening / night
}

export async function getJourney(id: string): Promise<JourneyWithJoins | null> {
  const { data, error } = await supabase
    .from('journeys')
    .select(JOURNEY_JOIN_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as JourneyWithJoins | null) ?? null;
}

export type MyJourney = JourneyRow & {
  vehicle: Pick<JoinedVehicle, 'make' | 'model' | 'energy_type' | 'is_verified'> | null;
  bookings_count: { requested: number; accepted: number };
};

export async function listMyJourneys(driverId: string): Promise<MyJourney[]> {
  const { data, error } = await supabase
    .from('journeys')
    .select(`
      id, driver_id, vehicle_id, origin_text, destination_text, departure_time, recurrence,
      seats_total, seats_available, suggested_contribution,
      luggage_allowed, pets_allowed, smoking_allowed, women_only,
      notes, status, created_at,
      vehicle:vehicles!journeys_vehicle_id_fkey ( make, model, energy_type, is_verified ),
      bookings ( status )
    `)
    .eq('driver_id', driverId)
    .order('departure_time', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const bookings = (row as { bookings: { status: string }[] }).bookings ?? [];
    const requested = bookings.filter((b) => b.status === 'requested').length;
    const accepted = bookings.filter((b) => b.status === 'accepted').length;
    // Strip embedded bookings from returned row shape.
    const { bookings: _b, ...rest } = row as Record<string, unknown>;
    void _b;
    return { ...(rest as MyJourney), bookings_count: { requested, accepted } };
  });
}

export type CreateJourneyInput = {
  vehicle_id: string;
  origin_location_id: string;
  destination_location_id: string;
  origin_text: string;               // denormalised for search/legacy
  destination_text: string;
  distance_km: number;
  departure_time: string; // ISO
  recurrence: Recurrence;
  seats: number;
  suggested_contribution: number;    // system-calculated
  contribution_per_seat: number;     // driver's final, must be within band
  luggage_allowed: boolean;
  pets_allowed: boolean;
  smoking_allowed: boolean;
  women_only: boolean;
  notes: string | null;
};

export async function createJourney(driverId: string, input: CreateJourneyInput): Promise<JourneyRow> {
  const { data, error } = await supabase
    .from('journeys')
    .insert({
      driver_id: driverId,
      vehicle_id: input.vehicle_id,
      origin_location_id:      input.origin_location_id,
      destination_location_id: input.destination_location_id,
      origin_text:             input.origin_text,
      destination_text:        input.destination_text,
      distance_km:             input.distance_km,
      // TODO: replace haversine distance with real road distance in Phase 6 (map).
      departure_time: input.departure_time,
      recurrence: input.recurrence,
      seats_total: input.seats,
      seats_available: input.seats,
      suggested_contribution: input.suggested_contribution,
      contribution_per_seat:  input.contribution_per_seat,
      luggage_allowed: input.luggage_allowed,
      pets_allowed: input.pets_allowed,
      smoking_allowed: input.smoking_allowed,
      women_only: input.women_only,
      notes: input.notes,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) throw mapCreateError(error);
  return data as JourneyRow;
}

function mapCreateError(err: { message?: string }): Error {
  const raw = err.message ?? 'Could not post the journey.';
  if (raw.includes('contribution_below_band')) {
    return new Error('That contribution is below the allowed range for this route.');
  }
  if (raw.includes('contribution_above_band')) {
    return new Error('That contribution is above the allowed range for this route.');
  }
  if (raw.includes('contribution_above_bus_fare')) {
    return new Error('That contribution is higher than the bus fare on this route — TUJYANE must stay cheaper than the bus.');
  }
  if (raw.includes('driver_not_verified')) {
    return new Error('Your driver profile is not verified yet. Upload your National ID and Driving license and wait for approval.');
  }
  if (raw.includes('vehicle_not_verified')) {
    return new Error('That car is pending verification. Upload the vehicle registration and a car photo for it, then wait for admin approval.');
  }
  if (raw.includes('vehicle_owner_mismatch')) {
    return new Error('That car does not belong to your account.');
  }
  if (raw.includes('vehicle_required')) {
    return new Error('Pick which car you will drive for this journey.');
  }
  return new Error(raw);
}

export async function cancelJourney(id: string): Promise<void> {
  const { error } = await supabase
    .from('journeys')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

/* ---------- helpers ---------- */
function atMidnight(d: Date) {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c;
}
function atEndOfDay(d: Date) {
  const c = new Date(d); c.setHours(23, 59, 59, 999); return c;
}

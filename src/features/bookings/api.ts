import { supabase } from '@/lib/supabase';
import type { EnergyType } from '@/features/vehicles/api';

export type BookingStatus =
  | 'requested' | 'accepted' | 'rejected'
  | 'boarding'  | 'in_trip'  | 'completed'
  | 'cancelled' | 'no_show';

export type BookingRow = {
  id: string;
  journey_id: string;
  passenger_id: string;
  seats_booked: number;
  status: BookingStatus;
  boarding_code: string | null;
  contribution_amount: number | null;
  payment_status: 'unpaid' | 'manual_paid';
  created_at: string;
  updated_at: string;
};

export const TERMINAL_STATUSES: BookingStatus[] = ['completed', 'cancelled', 'rejected', 'no_show'];

/** Returns the passenger's booking for a journey, if any. */
export async function getExistingBooking(journeyId: string, passengerId: string): Promise<BookingRow | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('journey_id', journeyId)
    .eq('passenger_id', passengerId)
    .maybeSingle();
  if (error) throw error;
  return (data as BookingRow | null) ?? null;
}

export type RequestRideInput = {
  journeyId: string;
  passengerId: string;
  seats: number;
  contributionAmount: number;
};

export async function requestRide(input: RequestRideInput): Promise<BookingRow> {
  const existing = await getExistingBooking(input.journeyId, input.passengerId);
  if (existing && !TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error('You already have a booking on this journey.');
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      journey_id: input.journeyId,
      passenger_id: input.passengerId,
      seats_booked: input.seats,
      status: 'requested',
      contribution_amount: input.contributionAmount,
      payment_status: 'unpaid',
    })
    .select('*')
    .single();
  if (error) {
    if (/duplicate key/i.test(error.message)) {
      throw new Error('You already have a booking on this journey.');
    }
    throw error;
  }
  return data as BookingRow;
}

/* -------------------- Driver-side operations -------------------- */

export type BookingWithPassenger = BookingRow & {
  passenger: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    rating_avg: number;
    rating_count: number;
  } | null;
};

export async function listBookingsForJourney(journeyId: string): Promise<BookingWithPassenger[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      passenger:profiles!bookings_passenger_id_fkey (
        id, full_name, avatar_url, rating_avg, rating_count
      )
    `)
    .eq('journey_id', journeyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as BookingWithPassenger[];
}

/**
 * Accept a booking via the RPC. Atomic: locks the journey, decrements seats,
 * generates a 4-digit boarding_code, flips status → 'accepted'.
 */
export async function acceptBooking(bookingId: string): Promise<BookingRow> {
  const { data, error } = await supabase.rpc('accept_booking', { p_booking_id: bookingId });
  if (error) throw mapRpcError(error);
  return data as BookingRow;
}

/** Driver rejects a still-'requested' booking. Direct update allowed by RLS. */
export async function rejectBooking(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'rejected' })
    .eq('id', bookingId);
  if (error) throw error;
}

/**
 * Passenger cancels via RPC. Restores the seat if the booking had been
 * 'accepted' (RPC handles the arithmetic).
 */
export async function cancelBooking(bookingId: string): Promise<BookingRow> {
  const { data, error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) throw mapRpcError(error);
  return data as BookingRow;
}

/** Driver enters the 4-digit code the passenger shows. */
export async function verifyBoarding(bookingId: string, code: string): Promise<BookingRow> {
  const { data, error } = await supabase.rpc('verify_boarding', {
    p_booking_id: bookingId,
    p_code: code,
  });
  if (error) throw mapRpcError(error);
  return data as BookingRow;
}

/** Driver-only: bulk move all currently-boarding bookings on a journey → 'in_trip'. */
export async function startTrip(journeyId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'in_trip' })
    .eq('journey_id', journeyId)
    .eq('status', 'boarding');
  if (error) throw error;
}

/** Driver-only: complete all in-trip bookings on a journey. */
export async function completeTripBookings(journeyId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'completed' })
    .eq('journey_id', journeyId)
    .in('status', ['in_trip', 'boarding']);
  if (error) throw error;
}

/**
 * Driver marks a passenger as no_show.
 * DECISION: we do NOT restore the seat. Rationale: seat was reserved for the
 * whole trip; no_show is a driver-facing signal for ratings/history, not a
 * live capacity change. The driver can no longer pick up someone else at that
 * point in the trip. Toggle only if product later says otherwise.
 */
export async function markNoShow(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'no_show' })
    .eq('id', bookingId);
  if (error) throw error;
}

/* -------------------- Passenger's my-trips -------------------- */

export type MyTripJourney = {
  id: string;
  origin_text: string;
  destination_text: string;
  departure_time: string;
  status: 'active' | 'full' | 'cancelled' | 'completed';
  suggested_contribution: number;
  contribution_per_seat: number | null;
  driver: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    rating_avg: number;
    rating_count: number;
    is_verified_driver: boolean;
  } | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number | null;
    color: string | null;
    plate_number: string;
    energy_type: EnergyType;
    is_verified: boolean;
  } | null;
};

export type MyTrip = BookingRow & {
  journey: MyTripJourney | null;
};

export async function listMyTrips(passengerId: string): Promise<MyTrip[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      journey:journeys!bookings_journey_id_fkey (
        id, origin_text, destination_text, departure_time, status,
        suggested_contribution, contribution_per_seat,
        driver:profiles!journeys_driver_id_fkey (
          id, full_name, avatar_url, rating_avg, rating_count, is_verified_driver
        ),
        vehicle:vehicles!journeys_vehicle_id_fkey (
          id, make, model, year, color, plate_number, energy_type, is_verified
        )
      )
    `)
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MyTrip[];
}

/** Booking + full passenger + journey. Driver-facing receipts list. */
export type MyDriverReceipt = BookingRow & {
  passenger: { id: string; full_name: string; avatar_url: string | null } | null;
  journey:   MyTripJourney | null;
};

/**
 * Every completed booking on a journey the driver posted, most-recent first.
 * Powers the driver-side Receipts view so drivers can download the same
 * TUJYANE-branded PDF as passengers.
 */
export async function listMyDriverReceipts(driverId: string): Promise<MyDriverReceipt[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      passenger:profiles!bookings_passenger_id_fkey (
        id, full_name, avatar_url
      ),
      journey:journeys!bookings_journey_id_fkey!inner (
        id, driver_id, origin_text, destination_text, departure_time, status,
        suggested_contribution, contribution_per_seat,
        driver:profiles!journeys_driver_id_fkey (
          id, full_name, avatar_url, rating_avg, rating_count, is_verified_driver
        ),
        vehicle:vehicles!journeys_vehicle_id_fkey (
          id, make, model, year, color, plate_number, energy_type, is_verified
        )
      )
    `)
    .eq('journey.driver_id', driverId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MyDriverReceipt[];
}

/* -------------------- helpers -------------------- */

function mapRpcError(err: { message?: string }): Error {
  const raw = err.message ?? 'Request failed';
  const table: Record<string, string> = {
    booking_not_found:              'This booking no longer exists.',
    booking_not_in_requested_state: 'This booking has already been handled.',
    booking_not_accepted:           'That booking is not in the accepted state.',
    booking_terminal:               'This booking is already closed.',
    not_journey_driver:             'Only the driver can do that.',
    not_booking_owner:              'You can only cancel your own booking.',
    journey_not_active:             'This journey is no longer active.',
    no_capacity:                    'No seats left on this journey.',
    bad_code:                       'That boarding code is not correct.',
    not_admin:                      'Only admins can do that.',
  };
  for (const key of Object.keys(table)) {
    if (raw.includes(key)) return new Error(table[key]);
  }
  return new Error(raw);
}

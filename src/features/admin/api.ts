import { supabase } from '@/lib/supabase';
import type { DriverDocument } from '@/features/verification/api';

export type IsAdminCheck = { admin: boolean; role: 'super_admin' | 'reviewer' | null };

/**
 * Checks whether the current auth user is an admin.
 *
 * We call the SECURITY DEFINER `is_admin` RPC rather than reading
 * `admin_users` directly — that table's SELECT RLS itself requires admin,
 * so a plain `.from('admin_users').eq('id', uid)` would always return empty
 * for the very user we're trying to check.
 *
 * Once we know the caller is admin, a follow-up select reads their role.
 */
export async function checkIsAdmin(userId: string): Promise<IsAdminCheck> {
  const rpc = await supabase.rpc('is_admin', { uid: userId });
  if (rpc.error || !rpc.data) return { admin: false, role: null };
  // is_admin returned true → admin_users row is now readable to this caller.
  const { data } = await supabase
    .from('admin_users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  const role = (data as { role: 'super_admin' | 'reviewer' } | null)?.role ?? null;
  return { admin: true, role };
}

export type QueueEntry = {
  driver_id: string;
  full_name: string;
  phone: string | null;
  is_verified_driver: boolean;
  pending_count: number;
  /** Uploaded-but-not-yet-submitted count. Shown as a separate chip so admin
   * can see when a driver is stuck at the "Send for verification" step —
   * fixes the "queue is empty even though a driver uploaded" bug by making
   * drafts visible instead of hidden. */
  draft_count: number;
  first_submitted_at: string | null;
  latest_submitted_at: string | null;
};

/**
 * Returns every driver with document activity that needs admin attention:
 * pending review OR uploaded-but-not-yet-submitted (draft). Most-recent first.
 * Non-admin callers get an empty result because driver_documents RLS
 * restricts SELECT to owner + admins.
 *
 * Previously this only fetched status='pending' — which meant drafts (docs
 * the driver uploaded but forgot to submit) were invisible to the admin and
 * the queue looked empty even when a submission was clearly waiting to be
 * nudged. Widened to include drafts, with a separate count so admins can see
 * exactly what state the driver is in.
 */
export async function listReviewQueue(): Promise<QueueEntry[]> {
  const { data: docs, error } = await supabase
    .from('driver_documents')
    .select('driver_id, created_at, status')
    .in('status', ['pending', 'draft'])
    .order('created_at', { ascending: false });
  if (error) throw error;

  const perDriver = new Map<string, { pending: number; draft: number; first: string; last: string }>();
  for (const d of (docs ?? []) as { driver_id: string; created_at: string; status: string }[]) {
    const cur = perDriver.get(d.driver_id);
    if (cur) {
      if (d.status === 'pending') cur.pending += 1;
      else                        cur.draft   += 1;
      if (d.created_at < cur.first) cur.first = d.created_at;
      if (d.created_at > cur.last)  cur.last  = d.created_at;
    } else {
      perDriver.set(d.driver_id, {
        pending: d.status === 'pending' ? 1 : 0,
        draft:   d.status === 'draft'   ? 1 : 0,
        first: d.created_at, last: d.created_at,
      });
    }
  }
  const ids = [...perDriver.keys()];
  if (ids.length === 0) return [];

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, phone, is_verified_driver')
    .in('id', ids);
  if (pErr) throw pErr;

  return (profiles ?? []).map((p) => {
    const row = p as { id: string; full_name: string; phone: string | null; is_verified_driver: boolean };
    const stats = perDriver.get(row.id)!;
    return {
      driver_id: row.id,
      full_name: row.full_name,
      phone: row.phone,
      is_verified_driver: row.is_verified_driver,
      pending_count: stats.pending,
      draft_count: stats.draft,
      first_submitted_at: stats.first,
      latest_submitted_at: stats.last,
    };
  }).sort((a, b) => {
    // Pending outranks draft-only; then most recent first.
    const pa = a.pending_count > 0 ? 1 : 0;
    const pb = b.pending_count > 0 ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (b.latest_submitted_at ?? '').localeCompare(a.latest_submitted_at ?? '');
  });
}

export type DriverReviewBundle = {
  driver: {
    id: string;
    full_name: string;
    phone: string | null;
    avatar_url: string | null;
    is_verified_driver: boolean;
    rating_avg: number;
    rating_count: number;
  } | null;
  documents: DriverDocument[];
  vehicles: {
    id: string;
    make: string; model: string;
    year: number | null;
    plate_number: string;
    color: string | null;
    seats: number;
    energy_type: string;
    is_verified: boolean;
    photo_url: string | null;
  }[];
};

export async function loadDriverReview(driverId: string): Promise<DriverReviewBundle> {
  const [driverRes, docsRes, vehRes] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, phone, avatar_url, is_verified_driver, rating_avg, rating_count')
      .eq('id', driverId).maybeSingle(),
    supabase.from('driver_documents')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false }),
    supabase.from('vehicles')
      .select('id, make, model, year, plate_number, color, seats, energy_type, is_verified, photo_url')
      .eq('owner_id', driverId)
      .order('created_at', { ascending: false }),
  ]);
  if (driverRes.error) throw driverRes.error;
  if (docsRes.error) throw docsRes.error;
  if (vehRes.error) throw vehRes.error;
  return {
    driver: (driverRes.data as DriverReviewBundle['driver']) ?? null,
    documents: (docsRes.data ?? []) as DriverDocument[],
    vehicles: (vehRes.data ?? []) as DriverReviewBundle['vehicles'],
  };
}

export async function approveDoc(docId: string) {
  const { data, error } = await supabase.rpc('approve_driver_document', { p_doc_id: docId });
  if (error) throw mapErr(error);
  return data;
}
export async function rejectDoc(docId: string, reason: string) {
  const { data, error } = await supabase.rpc('reject_driver_document', {
    p_doc_id: docId, p_reason: reason,
  });
  if (error) throw mapErr(error);
  return data;
}
export async function approveVehicle(vehicleId: string) {
  const { data, error } = await supabase.rpc('approve_vehicle', { p_vehicle_id: vehicleId });
  if (error) throw mapErr(error);
  return data;
}

function mapErr(err: { message?: string }) {
  const raw = err.message ?? 'Request failed';
  if (raw.includes('not_admin')) return new Error('Only admins can do that.');
  return new Error(raw);
}

/* ---------- Dashboard stats + user list ---------- */

export type AdminStats = {
  drivers_pending_verification: number;
  verified_drivers: number;
  total_drivers: number;
  total_users: number;
  total_journeys: number;
  active_journeys: number;
  total_bookings: number;
  completed_bookings: number;
};

export async function loadAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats');
  if (error) throw mapErr(error);
  return data as AdminStats;
}

export type AdminUserRow = {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role_intent: 'passenger' | 'driver' | 'both' | 'super_admin';
  is_verified_driver: boolean;
  is_demo: boolean;
  is_disabled: boolean;
  force_password_reset: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  last_seen_at: string | null;
};

export async function listAdminUsers(limit = 200): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('admin_list_users', { _limit: limit });
  if (error) throw mapErr(error);
  return (data ?? []) as AdminUserRow[];
}

/* --- Extended admin surfaces --- */

export type AdminRecentActivity = {
  since: string;
  now: string;
  new_users: number;
  new_journeys: number;
  new_bookings: number;
  pending_docs: number;
  new_ratings: number;
};

export async function loadRecentActivity(): Promise<AdminRecentActivity> {
  const { data, error } = await supabase.rpc('admin_recent_activity');
  if (error) throw mapErr(error);
  return data as AdminRecentActivity;
}

export type AdminDriverRow = {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_verified_driver: boolean;
  vehicles_count: number;
  verified_vehicles: number;
  journeys_count: number;
  active_journeys: number;
  is_demo: boolean;
  created_at: string;
};

export async function listAdminDrivers(limit = 100): Promise<AdminDriverRow[]> {
  const { data, error } = await supabase.rpc('admin_list_drivers', { p_limit: limit });
  if (error) throw mapErr(error);
  return (data ?? []) as AdminDriverRow[];
}

export type AdminJourneyRow = {
  id: string;
  driver_id: string;
  driver_name: string;
  origin_text: string;
  destination_text: string;
  departure_time: string;
  seats_total: number;
  seats_available: number;
  suggested_contribution: number;
  contribution_per_seat: number | null;
  status: string;
  distance_km: number | null;
  created_at: string;
};

export async function listAdminJourneys(limit = 100): Promise<AdminJourneyRow[]> {
  const { data, error } = await supabase.rpc('admin_list_journeys', { p_limit: limit });
  if (error) throw mapErr(error);
  return (data ?? []) as AdminJourneyRow[];
}

export type AdminBookingRow = {
  id: string;
  journey_id: string;
  passenger_name: string;
  driver_name: string;
  origin_text: string;
  destination_text: string;
  status: string;
  seats_booked: number;
  contribution_amount: number | null;
  payment_status: string;
  created_at: string;
};

export async function listAdminBookings(limit = 100): Promise<AdminBookingRow[]> {
  const { data, error } = await supabase.rpc('admin_list_bookings', { p_limit: limit });
  if (error) throw mapErr(error);
  return (data ?? []) as AdminBookingRow[];
}

export type ContributionSummary = {
  completed_rides: number;
  contribution_rwf: number;
  average_rwf: number;
  pending_manual_paid: number;
};

export async function loadContributionSummary(): Promise<ContributionSummary> {
  const { data, error } = await supabase.rpc('admin_contribution_summary');
  if (error) throw mapErr(error);
  return data as ContributionSummary;
}

export type AuditEvent = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  const { data, error } = await supabase.rpc('admin_audit_events', { p_limit: limit });
  if (error) throw mapErr(error);
  return (data ?? []) as AuditEvent[];
}

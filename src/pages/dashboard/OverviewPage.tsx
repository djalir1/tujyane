import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import { useDataFetch } from '@/lib/useDataFetch';
import { listMyTrips, type MyTrip } from '@/features/bookings/api';
import { listMyJourneys, type MyJourney } from '@/features/journeys/api';
import { listMyVehicles, type Vehicle } from '@/features/vehicles/api';
import { daysUntilExpiry, listMyDocuments, type DriverDocument } from '@/features/verification/api';
import { BoardingCodeDisplay } from '@/components/BoardingCodeDisplay';
import { formatDateTime, formatRWF, pluralSeats } from '@/lib/format';

type Bundle = {
  trips: MyTrip[];
  journeys: MyJourney[];
  vehicles: Vehicle[];
  docs: DriverDocument[];
};

export default function OverviewPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const role = profile?.role_intent ?? 'passenger';
  const showPassenger = role === 'passenger' || role === 'both';
  const showDriver    = role === 'driver'    || role === 'both';

  const fetcher = useCallback(async (): Promise<Bundle> => {
    if (!user) return { trips: [], journeys: [], vehicles: [], docs: [] };
    const [trips, journeys, vehicles, docs] = await Promise.all([
      showPassenger ? listMyTrips(user.id) : Promise.resolve([] as MyTrip[]),
      showDriver    ? listMyJourneys(user.id) : Promise.resolve([] as MyJourney[]),
      showDriver    ? listMyVehicles(user.id).catch(() => [] as Vehicle[]) : Promise.resolve([] as Vehicle[]),
      showDriver    ? listMyDocuments(user.id).catch(() => [] as DriverDocument[]) : Promise.resolve([] as DriverDocument[]),
    ]);
    return { trips, journeys, vehicles, docs };
  }, [user, showPassenger, showDriver]);

  const onError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not load your overview.';
      toast.push({ kind: 'error', message: msg });
    },
    [toast],
  );

  const { data, loading } = useDataFetch<Bundle>(
    fetcher, [user?.id, showPassenger, showDriver], { enabled: Boolean(user), onError });

  const trips    = data?.trips ?? [];
  const journeys = data?.journeys ?? [];
  const vehicles = data?.vehicles ?? [];
  const docs     = data?.docs ?? [];

  // Expiring / expired documents — one banner entry per doc so the driver
  // sees each car+doc pair separately. Show only insurance/inspection since
  // those are the ones with hard consequences (expired insurance unverifies
  // the car). Order: expired first, then soonest expiry.
  const expiringDocs = docs
    .filter((d) => d.status === 'approved' && d.expiry_date)
    .filter((d) => d.doc_type === 'insurance_certificate' || d.doc_type === 'inspection_certificate')
    .map((d) => ({ doc: d, daysLeft: daysUntilExpiry(d.expiry_date)! }))
    .filter(({ daysLeft }) => daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const upcomingTrips = trips.filter((t) => ['requested','accepted','boarding','in_trip'].includes(t.status));
  const nextTrip = upcomingTrips
    .filter((t) => t.journey?.departure_time)
    .sort((a, b) => (a.journey!.departure_time.localeCompare(b.journey!.departure_time)))
    .find(Boolean) ?? null;

  const activeJourneys = journeys.filter((j) => j.status === 'active' || j.status === 'full');
  const pendingRequestCount = journeys.reduce((sum, j) => sum + j.bookings_count.requested, 0);
  const acceptedCount       = journeys.reduce((sum, j) => sum + j.bookings_count.accepted, 0);

  // Recurrence "repost reminder" — for any recurring trip whose latest
  // departure is within the last 36 hours OR up to 6 hours ahead, prompt
  // the driver to post the next occurrence. Nothing is auto-created.
  const REPOST_LOOKAHEAD_MS = 6 * 60 * 60 * 1000;   // 6 hours ahead
  const REPOST_LOOKBACK_MS  = 36 * 60 * 60 * 1000;  // 36 hours behind
  const now = Date.now();
  const recurringDue = journeys
    .filter((j) => j.recurrence !== 'once')
    .filter((j) => {
      const dep = new Date(j.departure_time).getTime();
      return dep >= now - REPOST_LOOKBACK_MS && dep <= now + REPOST_LOOKAHEAD_MS;
    })
    .sort((a, b) => a.departure_time.localeCompare(b.departure_time));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <header>
        <p className="text-sm text-text-muted">
          Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.
        </p>
      </header>

      {/* Verification nudge only when driver but not verified. */}
      {showDriver && profile && !profile.is_verified_driver && (
        <Card className="!bg-warning/10 !border-warning/30">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <CardTitle>Get verified to build trust</CardTitle>
              <CardDescription>Upload your documents so passengers see a verified badge.</CardDescription>
            </div>
            <Link to="/dashboard/verification"><Button>Verify now</Button></Link>
          </div>
        </Card>
      )}

      {/* Expiring / expired vehicle docs — highest-urgency banner on the
          driver dashboard. Fires at 7 days out and stays until renewed. An
          expired insurance forces the car back to unverified via the server
          recompute — the driver can't post trips on that car until they
          re-upload + get admin approval. */}
      {showDriver && expiringDocs.length > 0 && (
        <div className="grid gap-2">
          {expiringDocs.map(({ doc: d, daysLeft }) => {
            const v = vehicles.find((x) => x.id === d.vehicle_id);
            const vLabel = v ? `${v.make} ${v.model} (${v.plate_number})` : 'your car';
            const typeLabel = d.doc_type === 'insurance_certificate' ? 'Insurance'
              : d.doc_type === 'inspection_certificate' ? 'Vehicle inspection'
              : d.doc_type;
            const isExpiredNow = daysLeft < 0;
            return (
              <Card
                key={d.id}
                className={isExpiredNow ? '!bg-danger/10 !border-danger/30' : '!bg-warning/10 !border-warning/30'}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="t-caption">{isExpiredNow ? 'Expired' : 'Expiring soon'}</div>
                    <CardTitle>
                      {typeLabel} for {vLabel} {isExpiredNow ? 'expired' : 'expires'}{' '}
                      {isExpiredNow
                        ? `on ${new Date(d.expiry_date!).toLocaleDateString()}`
                        : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                    </CardTitle>
                    <CardDescription>
                      {isExpiredNow
                        ? 'Your car is now unverified for posting. Renew and re-upload to keep driving.'
                        : 'Renew and re-upload before it lapses to avoid losing your posting privileges.'}
                    </CardDescription>
                  </div>
                  <Link to="/dashboard/verification"><Button size="sm">Open verification</Button></Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recurrence reminders — for pilot V1 the recurrence field is a
          "remind me to post the next one" signal, not an auto-scheduler.
          Driver clicks "Post next", the form is pre-filled with the recurring
          trip's route/vehicle/price, and the next departure_time is proposed
          from the recurrence cadence. */}
      {showDriver && recurringDue.length > 0 && (
        <div className="grid gap-3">
          {recurringDue.map((j) => {
            const nextIso = nextOccurrenceIso(j.departure_time, j.recurrence);
            const nextText = nextIso ? formatDateTime(nextIso).full : 'soon';
            const params = new URLSearchParams({
              from_id: j.origin_location_id ?? '',
              to_id:   j.destination_location_id ?? '',
              vehicle_id: j.vehicle_id ?? '',
              seats: String(j.seats_total),
              contribution: String(j.contribution_per_seat ?? j.suggested_contribution),
              departure: nextIso ?? '',
              recurrence: j.recurrence,
            });
            return (
              <Card key={j.id} className="!bg-brand/10 !border-brand/25">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="t-caption">Recurring trip</div>
                    <CardTitle>Post the next {j.origin_text} → {j.destination_text}?</CardTitle>
                    <CardDescription>
                      Cadence: {j.recurrence}. Suggested next departure: {nextText}.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link to={`/dashboard/journeys/new?${params.toString()}`}>
                      <Button size="sm">Post next</Button>
                    </Link>
                    <Link to={`/dashboard/journeys/${j.id}/manage`}>
                      <Button size="sm" variant="ghost">Edit / cancel</Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton heightClass="h-40" />
          <Skeleton heightClass="h-40" />
        </div>
      ) : (
        <div className={['grid gap-4', showPassenger && showDriver ? 'md:grid-cols-2' : ''].join(' ')}>
          {showPassenger && (
            <PassengerCard nextTrip={nextTrip} upcomingCount={upcomingTrips.length} />
          )}
          {showDriver && (
            <DriverCard
              activeCount={activeJourneys.length}
              pendingRequests={pendingRequestCount}
              accepted={acceptedCount}
            />
          )}
        </div>
      )}

      {/* Rating snapshot */}
      {profile && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <CardTitle>Your reputation</CardTitle>
              <CardDescription>
                Ratings other riders and drivers gave you.
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums text-text">
                {profile.rating_count ? profile.rating_avg.toFixed(1) : '—'}
                <span className="text-warning ml-1">★</span>
              </div>
              <div className="text-xs text-text-muted">
                {profile.rating_count ? `${profile.rating_count} rating${profile.rating_count > 1 ? 's' : ''}` : 'No ratings yet'}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------- Passenger card ---------- */
function PassengerCard({ nextTrip, upcomingCount }: { nextTrip: MyTrip | null; upcomingCount: number }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="t-caption">Passenger</div>
          <CardTitle>Upcoming trips</CardTitle>
        </div>
        <div className="text-2xl font-bold tabular-nums text-text">{upcomingCount}</div>
      </div>

      {nextTrip && nextTrip.journey ? (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-text-muted">Next trip · {formatDateTime(nextTrip.journey.departure_time).full}</div>
          <div className="text-sm font-semibold text-text truncate">
            {nextTrip.journey.origin_text} → {nextTrip.journey.destination_text}
          </div>
          <div className="text-xs text-text-muted truncate">
            {nextTrip.journey.driver?.full_name ?? 'Driver'}
            {' · '}
            {pluralSeats(nextTrip.seats_booked)}
            {' · '}
            {formatRWF(nextTrip.contribution_amount ?? 0)}
          </div>
          {nextTrip.status === 'accepted' && nextTrip.boarding_code && (
            <BoardingCodeDisplay code={nextTrip.boarding_code} />
          )}
          <div className="flex gap-2">
            <Link to="/dashboard/trips"><Button size="sm" variant="outline">See all my trips</Button></Link>
            <Link to="/"><Button size="sm" variant="ghost">Find a ride</Button></Link>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <CardDescription>No upcoming trips — find a ride to get started.</CardDescription>
          <div className="mt-4">
            <Link to="/"><Button size="sm">Find a ride</Button></Link>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Driver card ---------- */
function DriverCard({ activeCount, pendingRequests, accepted }: { activeCount: number; pendingRequests: number; accepted: number }) {
  if (activeCount === 0 && pendingRequests === 0 && accepted === 0) {
    return (
      <Card>
        <div className="t-caption">Driver</div>
        <CardTitle>You have no active journeys</CardTitle>
        <CardDescription>Post your first trip and passengers will find it right away.</CardDescription>
        <div className="mt-4">
          <Link to="/dashboard/journeys/new"><Button size="sm">Post a journey</Button></Link>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="t-caption">Driver</div>
          <CardTitle>Active journeys</CardTitle>
        </div>
        <div className="text-2xl font-bold tabular-nums text-text">{activeCount}</div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile
          label="Requests waiting"
          value={pendingRequests}
          tone={pendingRequests > 0 ? 'warning' : 'muted'}
        />
        <StatTile label="Accepted" value={accepted} tone="brand" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/dashboard/journeys"><Button size="sm" variant="outline">Manage journeys</Button></Link>
        <Link to="/dashboard/journeys/new"><Button size="sm">Post a journey</Button></Link>
      </div>
    </Card>
  );
}

/**
 * Compute the "next occurrence" ISO for a recurring trip. Honest V1 rules
 * matching the enum values used everywhere:
 *   daily     → +1 day
 *   weekly    → +7 days
 *   weekdays  → next Mon..Fri
 *   weekends  → next Sat..Sun
 *   once      → null (nothing to repost)
 * Time of day is preserved from the previous departure.
 */
function nextOccurrenceIso(prevIso: string, rec: string): string | null {
  if (rec === 'once' || !rec) return null;
  const prev = new Date(prevIso);
  const advance = (d: Date, days: number) => { const c = new Date(d); c.setDate(c.getDate() + days); return c; };
  let candidate = advance(prev, 1);
  const isWeekday = (d: Date) => { const w = d.getDay(); return w >= 1 && w <= 5; };
  const isWeekend = (d: Date) => { const w = d.getDay(); return w === 0 || w === 6; };
  if (rec === 'daily')    return candidate.toISOString();
  if (rec === 'weekly')   return advance(prev, 7).toISOString();
  if (rec === 'weekdays') { while (!isWeekday(candidate)) candidate = advance(candidate, 1); return candidate.toISOString(); }
  if (rec === 'weekends') { while (!isWeekend(candidate)) candidate = advance(candidate, 1); return candidate.toISOString(); }
  return null;
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'warning' | 'muted' }) {
  const bg = tone === 'brand'
    ? 'bg-brand/10 border-brand/25 text-brand'
    : tone === 'warning'
      ? 'bg-warning/10 border-warning/25 text-warning'
      : 'bg-surface-hover border-border text-text-muted';
  return (
    <div className={['rounded-field border p-3', bg].join(' ')}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

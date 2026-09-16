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
import { BoardingCodeDisplay } from '@/components/BoardingCodeDisplay';
import { formatDateTime, formatRWF, pluralSeats } from '@/lib/format';

type Bundle = {
  trips: MyTrip[];
  journeys: MyJourney[];
};

export default function OverviewPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const role = profile?.role_intent ?? 'passenger';
  const showPassenger = role === 'passenger' || role === 'both';
  const showDriver    = role === 'driver'    || role === 'both';

  const fetcher = useCallback(async (): Promise<Bundle> => {
    if (!user) return { trips: [], journeys: [] };
    const [trips, journeys] = await Promise.all([
      showPassenger ? listMyTrips(user.id) : Promise.resolve([]),
      showDriver    ? listMyJourneys(user.id) : Promise.resolve([]),
    ]);
    return { trips, journeys };
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

  const upcomingTrips = trips.filter((t) => ['requested','accepted','boarding','in_trip'].includes(t.status));
  const nextTrip = upcomingTrips
    .filter((t) => t.journey?.departure_time)
    .sort((a, b) => (a.journey!.departure_time.localeCompare(b.journey!.departure_time)))
    .find(Boolean) ?? null;

  const activeJourneys = journeys.filter((j) => j.status === 'active' || j.status === 'full');
  const pendingRequestCount = journeys.reduce((sum, j) => sum + j.bookings_count.requested, 0);
  const acceptedCount       = journeys.reduce((sum, j) => sum + j.bookings_count.accepted, 0);

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

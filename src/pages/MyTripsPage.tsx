import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import {
  cancelBooking, listMyTrips, TERMINAL_STATUSES,
  type BookingStatus, type MyTrip,
} from '@/features/bookings/api';
import { BoardingCodeDisplay } from '@/components/BoardingCodeDisplay';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { RatingDialog } from '@/features/ratings/RatingDialog';
import { listRatingsForBookings } from '@/features/ratings/api';
import { Avatar } from '@/components/layout/UserMenu';
import { formatDateTime, formatRWF, pluralSeats } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';

type Data = {
  trips: MyTrip[];
  ratedBookingIds: Set<string>;
};

const STATUS_ORDER: BookingStatus[] = [
  'boarding', 'in_trip', 'accepted', 'requested',
  'completed', 'cancelled', 'rejected', 'no_show',
];

export default function MyTripsPage() {
  const { user } = useAuth();
  const toast = useToast();

  const fetcher = useCallback(async (): Promise<Data> => {
    if (!user) return { trips: [], ratedBookingIds: new Set() };
    const trips = await listMyTrips(user.id);
    const ratings = trips.length > 0
      ? await listRatingsForBookings(trips.map((t) => t.id))
      : [];
    return {
      trips,
      ratedBookingIds: new Set(ratings.filter((r) => r.rater_id === user.id).map((r) => r.booking_id)),
    };
  }, [user]);

  const onError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not load your trips.';
      toast.push({ kind: 'error', message: msg });
    },
    [toast],
  );

  const { data, loading, refreshing, refetch } = useDataFetch<Data>(
    fetcher, [user?.id], { enabled: Boolean(user), onError });

  const trips = data?.trips ?? [];
  const ratedIds = data?.ratedBookingIds ?? new Set<string>();

  const [tab, setTab] = useState<'active' | 'history'>('active');

  const { active, history } = useMemo(() => {
    const rank = new Map(STATUS_ORDER.map((s, i) => [s, i]));
    const sorted = [...trips].sort((a, b) => (rank.get(a.status)! - rank.get(b.status)!));
    return {
      active: sorted.filter((t) => !TERMINAL_STATUSES.includes(t.status)),
      history: sorted.filter((t) => TERMINAL_STATUSES.includes(t.status)),
    };
  }, [trips]);
  const rows = tab === 'active' ? active : history;

  const [ratingFor, setRatingFor] = useState<MyTrip | null>(null);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="t-caption">Passenger</div>
          <h1 className="t-h1 text-text mt-1">My trips</h1>
        </div>
        <Link to="/">
          <Button size="sm" variant="outline">Find another ride</Button>
        </Link>
      </header>

      {refreshing && (
        <div className="text-xs text-text-muted -mt-2" aria-live="polite">Refreshing…</div>
      )}

      <div className="flex items-center gap-1 rounded-pill border border-border bg-bg-elevated p-1 w-fit">
        <TabChip active={tab === 'active'}  onClick={() => setTab('active')}  label={`Active${active.length ? ` (${active.length})` : ''}`} />
        <TabChip active={tab === 'history'} onClick={() => setTab('history')} label={`History${history.length ? ` (${history.length})` : ''}`} />
      </div>

      {loading ? (
        <div className="grid gap-3" aria-busy="true">
          <MyTripSkeletonRow />
          <MyTripSkeletonRow />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardTitle>
            {tab === 'active' ? 'No active trips' : 'No past trips yet'}
          </CardTitle>
          <CardDescription>
            {tab === 'active'
              ? 'When you request or start a ride, it will show up here. Search for a ride to get started.'
              : 'Completed and cancelled bookings will appear here.'}
          </CardDescription>
          {tab === 'active' && (
            <div className="mt-4">
              <Link to="/search"><Button>Browse rides</Button></Link>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((t) => (
            <TripCard
              key={t.id}
              trip={t}
              rated={ratedIds.has(t.id)}
              onRate={() => setRatingFor(t)}
              onCancelled={refetch}
            />
          ))}
        </div>
      )}

      {ratingFor && user && ratingFor.journey?.driver && (
        <RatingDialog
          bookingId={ratingFor.id}
          raterId={user.id}
          rateeId={ratingFor.journey.driver.id}
          rateeName={ratingFor.journey.driver.full_name}
          onClose={() => setRatingFor(null)}
          onSubmitted={async () => {
            setRatingFor(null);
            await refetch();
          }}
        />
      )}
    </div>
  );
}

function TripCard({
  trip, rated, onRate, onCancelled,
}: {
  trip: MyTrip;
  rated: boolean;
  onRate: () => void;
  onCancelled: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const j = trip.journey;
  const dt = j ? formatDateTime(j.departure_time) : null;
  const terminal = TERMINAL_STATUSES.includes(trip.status);

  async function doCancel() {
    if (!confirm('Cancel this booking?')) return;
    try {
      setBusy(true);
      await cancelBooking(trip.id);
      toast.push({ kind: 'info', message: 'Booking cancelled.' });
      await onCancelled();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not cancel.';
      toast.push({ kind: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={terminal ? 'opacity-90' : ''}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>{dt?.full ?? '—'}</span>
              <BookingStatusBadge status={trip.status} size="sm" />
            </div>
            {j && (
              <div className="mt-2 text-sm font-semibold text-text truncate">
                {j.origin_text} → {j.destination_text}
              </div>
            )}
            {j && (
              <div className="mt-1 text-xs text-text-muted">
                {pluralSeats(trip.seats_booked)} · {formatRWF(trip.contribution_amount ?? 0)}
              </div>
            )}
          </div>
          {j && (
            <Link to={`/journeys/${j.id}`} className="shrink-0">
              <Button size="sm" variant="outline">View</Button>
            </Link>
          )}
        </div>

        {/* Accepted → prominently show boarding code */}
        {trip.status === 'accepted' && trip.boarding_code && (
          <>
            <BoardingCodeDisplay code={trip.boarding_code} />
            {j?.driver && j?.vehicle && (
              <VehicleAndDriverStrip
                driverName={j.driver.full_name}
                driverAvatar={j.driver.avatar_url}
                verified={j.driver.is_verified_driver}
                make={j.vehicle.make}
                model={j.vehicle.model}
                color={j.vehicle.color}
                plate={j.vehicle.plate_number}
                energy={j.vehicle.energy_type}
              />
            )}
          </>
        )}

        {/* Boarding + in_trip → show driver/vehicle summary, no cancel */}
        {(trip.status === 'boarding' || trip.status === 'in_trip') && j?.driver && j?.vehicle && (
          <div className="rounded-field bg-brand/10 border border-brand/25 p-4 text-sm text-text">
            {trip.status === 'boarding' ? 'You are boarding.' : 'On your way.'}{' '}
            Driven by {j.driver.full_name} · {j.vehicle.make} {j.vehicle.model} · plate {j.vehicle.plate_number}.
          </div>
        )}

        {/* Actions per status */}
        <div className="flex flex-wrap items-center gap-2">
          {trip.status === 'requested' && (
            <>
              <div className="text-sm text-text-muted flex-1">Waiting for the driver to accept.</div>
              <Button size="sm" variant="danger" onClick={doCancel} loading={busy}>Cancel request</Button>
            </>
          )}
          {trip.status === 'accepted' && (
            <>
              <div className="text-sm text-text-muted flex-1">Cancelling will release your seat.</div>
              <Button size="sm" variant="outline" onClick={doCancel} loading={busy}>Cancel booking</Button>
            </>
          )}
          {trip.status === 'completed' && (
            rated ? (
              <span className="text-xs text-text-muted">Rated · thanks!</span>
            ) : (
              <Button size="sm" onClick={onRate}>Rate your driver</Button>
            )
          )}
        </div>
      </div>
    </Card>
  );
}

function VehicleAndDriverStrip({
  driverName, driverAvatar, verified,
  make, model, color, plate, energy,
}: {
  driverName: string; driverAvatar: string | null; verified: boolean;
  make: string; model: string; color: string | null; plate: string;
  energy: string;
}) {
  return (
    <div className="rounded-field bg-bg-elevated border border-border p-4 flex items-center gap-3">
      <Avatar name={driverName} url={driverAvatar} size={44} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text truncate">
          {driverName}
          {verified && <span className="ml-1 text-xs text-brand">· verified</span>}
        </div>
        <div className="text-xs text-text-muted truncate">
          {make} {model}{color ? ` · ${color}` : ''}{energy === 'electric' ? ' ⚡' : ''}
        </div>
      </div>
      <div className="shrink-0 rounded-field bg-surface border border-border px-3 py-1.5 text-sm font-bold tabular-nums text-text">
        {plate}
      </div>
    </div>
  );
}

function TabChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center h-8 px-3 rounded-pill text-xs font-semibold transition-colors',
        active ? 'bg-navy text-white' : 'text-text-muted hover:text-text',
      ].join(' ')}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function MyTripSkeletonRow() {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton widthClass="w-32" heightClass="h-3.5" />
          <Skeleton widthClass="w-3/5" heightClass="h-4" />
          <Skeleton widthClass="w-2/5" heightClass="h-3" />
        </div>
        <Skeleton widthClass="w-16" heightClass="h-9" />
      </div>
    </Card>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import { getJourney, type JourneyWithJoins } from '@/features/journeys/api';
import {
  acceptBooking, completeTripBookings, listBookingsForJourney,
  markNoShow, rejectBooking, startTrip, verifyBoarding,
  type BookingStatus, type BookingWithPassenger,
} from '@/features/bookings/api';
import { Avatar } from '@/components/layout/UserMenu';
import { CodeInput } from '@/components/CodeInput';
import { RatingDialog } from '@/features/ratings/RatingDialog';
import { listRatingsForBookings } from '@/features/ratings/api';
import { formatDateTime, formatRWF, pluralSeats } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';

type Combined = {
  journey: JourneyWithJoins | null;
  bookings: BookingWithPassenger[];
  ratedBookingIds: Set<string>; // bookings this driver has already rated
};

export default function JourneyManagePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const fetcher = useCallback(async (): Promise<Combined> => {
    const [j, bs] = await Promise.all([getJourney(id), listBookingsForJourney(id)]);
    let ratedIds = new Set<string>();
    if (user && bs.length > 0) {
      const ratings = await listRatingsForBookings(bs.map((b) => b.id));
      ratedIds = new Set(ratings.filter((r) => r.rater_id === user.id).map((r) => r.booking_id));
    }
    return { journey: j, bookings: bs, ratedBookingIds: ratedIds };
  }, [id, user]);

  const onError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not load bookings.';
      toast.push({ kind: 'error', message: msg });
    },
    [toast],
  );

  const { data, loading, refreshing, refetch } = useDataFetch<Combined>(
    fetcher, [id, user?.id], { enabled: Boolean(id), onError });

  const journey = data?.journey ?? null;
  const bookings = data?.bookings ?? [];
  const ratedIds = data?.ratedBookingIds ?? new Set<string>();

  const grouped = useMemo(() => groupByStatus(bookings), [bookings]);

  const [ratingFor, setRatingFor] = useState<BookingWithPassenger | null>(null);

  // Not the owning driver → redirect (RLS blocks bookings read anyway).
  if (!loading && journey && user && journey.driver_id !== user.id) {
    nav(`/journeys/${id}`, { replace: true });
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <header>
        <div className="t-caption">Driver · manage bookings</div>
        <h1 className="t-h1 text-text mt-1">
          {journey ? `${journey.origin_text} → ${journey.destination_text}` : 'Journey'}
        </h1>
        {journey && (
          <p className="mt-1 text-sm text-text-muted">
            {formatDateTime(journey.departure_time).full}
            {' · '}
            {pluralSeats(journey.seats_available)} left of {journey.seats_total}
            {' · '}
            {formatRWF((journey.contribution_per_seat ?? journey.suggested_contribution))} / seat
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Link to={`/journeys/${id}`}>
            <Button variant="outline" size="sm">View public page</Button>
          </Link>
          <Link to="/dashboard/journeys">
            <Button variant="ghost" size="sm">All my journeys</Button>
          </Link>
        </div>
      </header>

      {refreshing && (
        <div className="text-xs text-text-muted -mt-2" aria-live="polite">Refreshing…</div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <SkeletonGroup />
          <SkeletonGroup />
        </div>
      ) : (
        <>
          <Group
            title="Waiting for you"
            emptyText="No pending requests."
            bookings={grouped.requested}
            renderActions={(b) => (
              <RequestedActions bookingId={b.id} onDone={refetch} />
            )}
          />

          <Group
            title="Accepted · awaiting boarding"
            emptyText="Nobody's ready to board yet."
            bookings={grouped.accepted}
            renderActions={(b) => (
              <AcceptedActions
                bookingId={b.id}
                onVerified={refetch}
                onNoShow={refetch}
              />
            )}
          />

          <Group
            title="Boarding"
            emptyText="No boarded passengers yet."
            bookings={grouped.boarding}
            renderActions={() => null}
            headerAction={
              grouped.boarding.length > 0 ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await startTrip(id);
                      toast.push({ kind: 'success', message: 'Trip started.' });
                      await refetch();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Could not start trip.';
                      toast.push({ kind: 'error', message: msg });
                    }
                  }}
                >
                  Start trip
                </Button>
              ) : null
            }
          />

          <Group
            title="In trip"
            emptyText="No passengers in trip."
            bookings={grouped.in_trip}
            renderActions={(b) => (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await markNoShow(b.id);
                    toast.push({ kind: 'info', message: 'Marked as no-show.' });
                    await refetch();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Could not mark no-show.';
                    toast.push({ kind: 'error', message: msg });
                  }
                }}
              >
                No-show
              </Button>
            )}
            headerAction={
              grouped.in_trip.length > 0 ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await completeTripBookings(id);
                      toast.push({ kind: 'success', title: 'Trip complete', message: 'Passengers can now rate you.' });
                      await refetch();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Could not complete trip.';
                      toast.push({ kind: 'error', message: msg });
                    }
                  }}
                >
                  Complete trip
                </Button>
              ) : null
            }
          />

          <Group
            title="Completed"
            emptyText="Once a trip finishes it lands here."
            bookings={grouped.completed}
            renderActions={(b) => (
              ratedIds.has(b.id) ? (
                <span className="text-xs text-text-muted">You rated · thanks!</span>
              ) : (
                <Button size="sm" onClick={() => setRatingFor(b)}>Rate passenger</Button>
              )
            )}
          />

          {(grouped.rejected.length + grouped.cancelled.length + grouped.no_show.length > 0) && (
            <Group
              title="Closed"
              emptyText=""
              bookings={[...grouped.rejected, ...grouped.cancelled, ...grouped.no_show]}
              renderActions={() => null}
              muted
            />
          )}
        </>
      )}

      {ratingFor && user && ratingFor.passenger && (
        <RatingDialog
          bookingId={ratingFor.id}
          raterId={user.id}
          rateeId={ratingFor.passenger.id}
          rateeName={ratingFor.passenger.full_name}
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

/* --------------- Sub-components --------------- */

function Group({
  title, emptyText, bookings, renderActions, headerAction, muted,
}: {
  title: string;
  emptyText: string;
  bookings: BookingWithPassenger[];
  renderActions: (b: BookingWithPassenger) => React.ReactNode;
  headerAction?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="t-h3 text-text">
          {title}
          <span className="ml-2 text-xs font-semibold text-text-muted tabular-nums">
            {bookings.length}
          </span>
        </h2>
        {headerAction}
      </div>
      {bookings.length === 0 && emptyText ? (
        <p className="text-sm text-text-muted">{emptyText}</p>
      ) : (
        <div className="grid gap-2">
          {bookings.map((b) => (
            <BookingRow key={b.id} b={b} actions={renderActions(b)} muted={muted} />
          ))}
        </div>
      )}
    </section>
  );
}

function BookingRow({
  b, actions, muted,
}: { b: BookingWithPassenger; actions: React.ReactNode; muted?: boolean }) {
  const name = b.passenger?.full_name ?? 'Passenger';
  const rating = b.passenger?.rating_count ? b.passenger.rating_avg.toFixed(1) : '—';
  return (
    <Card className={muted ? 'opacity-70' : ''}>
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={name} url={b.passenger?.avatar_url ?? null} size={40} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text truncate">
              {name}
              <StatusBadge status={b.status} className="ml-2" />
            </div>
            <div className="text-xs text-text-muted">
              ★ {rating} · {pluralSeats(b.seats_booked)} · {formatRWF(b.contribution_amount ?? 0)}
              {b.boarding_code && (b.status === 'accepted' || b.status === 'boarding') && (
                <> · code <span className="tabular-nums font-semibold text-text">{b.boarding_code}</span></>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">{actions}</div>
      </div>
    </Card>
  );
}

function StatusBadge({ status, className = '' }: { status: BookingStatus; className?: string }) {
  const map: Record<BookingStatus, { label: string; cls: string }> = {
    requested: { label: 'REQUESTED', cls: 'bg-warning/15 text-warning' },
    accepted:  { label: 'ACCEPTED',  cls: 'bg-brand/15 text-brand' },
    boarding:  { label: 'BOARDING',  cls: 'bg-brand/15 text-brand' },
    in_trip:   { label: 'IN TRIP',   cls: 'bg-brand/15 text-brand' },
    completed: { label: 'COMPLETED', cls: 'bg-surface-hover text-text-muted' },
    cancelled: { label: 'CANCELLED', cls: 'bg-danger/15 text-danger' },
    rejected:  { label: 'REJECTED',  cls: 'bg-danger/15 text-danger' },
    no_show:   { label: 'NO-SHOW',   cls: 'bg-danger/15 text-danger' },
  };
  const m = map[status];
  return (
    <span className={['inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold tracking-wider', m.cls, className].join(' ')}>
      {m.label}
    </span>
  );
}

function RequestedActions({ bookingId, onDone }: { bookingId: string; onDone: () => Promise<void> | void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        loading={busy === 'reject'}
        onClick={async () => {
          try {
            setBusy('reject');
            await rejectBooking(bookingId);
            toast.push({ kind: 'info', message: 'Booking rejected.' });
            await onDone();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Could not reject.';
            toast.push({ kind: 'error', message: msg });
          } finally { setBusy(null); }
        }}
      >
        Reject
      </Button>
      <Button
        size="sm"
        loading={busy === 'accept'}
        onClick={async () => {
          try {
            setBusy('accept');
            await acceptBooking(bookingId);
            toast.push({ kind: 'success', title: 'Accepted', message: 'A boarding code was generated for the passenger.' });
            await onDone();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Could not accept.';
            toast.push({ kind: 'error', message: msg });
          } finally { setBusy(null); }
        }}
      >
        Accept
      </Button>
    </>
  );
}

function AcceptedActions({
  bookingId, onVerified, onNoShow,
}: {
  bookingId: string;
  onVerified: () => Promise<void> | void;
  onNoShow: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    if (code.length !== 4) { setError('Enter the 4-digit code.'); return; }
    try {
      setBusy(true);
      setError(null);
      await verifyBoarding(bookingId, code);
      toast.push({ kind: 'success', message: 'Boarding confirmed.' });
      setOpen(false);
      setCode('');
      await onVerified();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not verify.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          if (!confirm('Mark this passenger as no-show?')) return;
          try {
            await markNoShow(bookingId);
            toast.push({ kind: 'info', message: 'Marked as no-show.' });
            await onNoShow();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Could not mark no-show.';
            toast.push({ kind: 'error', message: msg });
          }
        }}
      >
        No-show
      </Button>
      <Button size="sm" onClick={() => { setCode(''); setError(null); setOpen(true); }}>
        Verify boarding
      </Button>

      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Verify boarding code"
            className="relative w-full max-w-sm rounded-card bg-bg-elevated border border-border shadow-elevate p-6"
          >
            <h2 className="t-h2 text-text">Verify boarding</h2>
            <p className="text-sm text-text-muted mt-1">
              Ask the passenger to show you their 4-digit code.
            </p>
            <div className="mt-5">
              <CodeInput
                autoFocus
                value={code}
                onChange={(v) => { setCode(v); if (error) setError(null); }}
                onComplete={(v) => { setCode(v); }}
                error={error}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button loading={busy} onClick={verify} disabled={code.length !== 4}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* --------------- helpers --------------- */

function groupByStatus(rows: BookingWithPassenger[]) {
  const empty: Record<BookingStatus, BookingWithPassenger[]> = {
    requested: [], accepted: [], rejected: [],
    boarding: [], in_trip: [], completed: [],
    cancelled: [], no_show: [],
  };
  for (const r of rows) empty[r.status].push(r);
  return empty;
}

function SkeletonGroup() {
  return (
    <section className="space-y-2">
      <Skeleton widthClass="w-40" heightClass="h-5" />
      <Card>
        <div className="flex items-center gap-3">
          <Skeleton shape="circle" heightClass="h-10" widthClass="w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton widthClass="w-1/3" heightClass="h-4" />
            <Skeleton widthClass="w-2/3" heightClass="h-3" />
          </div>
          <Skeleton widthClass="w-24" heightClass="h-9" />
        </div>
      </Card>
    </section>
  );
}

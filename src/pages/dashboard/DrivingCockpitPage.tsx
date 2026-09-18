import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { CodeInput } from '@/components/CodeInput';
import { Avatar } from '@/components/layout/UserMenu';
import { BookingStatusBadge } from '@/components/BookingStatusBadge';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import {
  completeTripBookings, listBookingsForJourney,
  markNoShow, startTrip, verifyBoarding,
  type BookingWithPassenger,
} from '@/features/bookings/api';
import { listMyJourneys, type MyJourney } from '@/features/journeys/api';
import { formatDateTime, pluralSeats } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';

/**
 * The "Driving" cockpit — a big-tap, one-handed screen the driver uses on
 * the road. Auto-selects the journey whose departure is next; the driver can
 * flip between their live journeys. Big code entry for boarding, big Start /
 * Complete buttons, no marketing polish.
 */
type Bundle = {
  liveJourneys: MyJourney[];
  bookings: Record<string, BookingWithPassenger[]>;
};

export default function DrivingCockpitPage() {
  const { user } = useAuth();
  const toast = useToast();

  const fetcher = useCallback(async (): Promise<Bundle> => {
    if (!user) return { liveJourneys: [], bookings: {} };
    const all = await listMyJourneys(user.id);
    const live = all.filter((j) => j.status === 'active' || j.status === 'full');
    const bookings: Record<string, BookingWithPassenger[]> = {};
    for (const j of live) {
      const bs = await listBookingsForJourney(j.id);
      bookings[j.id] = bs.filter((b) => b.status !== 'cancelled' && b.status !== 'rejected');
    }
    return { liveJourneys: live, bookings };
  }, [user]);

  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load your live journeys.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading, refetch } = useDataFetch<Bundle>(fetcher, [user?.id], { enabled: Boolean(user), onError });
  const live = data?.liveJourneys ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (selectedId ? live.find((j) => j.id === selectedId) : live[0]) ?? null,
    [live, selectedId],
  );
  const bookings = selected ? (data?.bookings[selected.id] ?? []) : [];

  if (loading) return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6"><Skeleton heightClass="h-64" /></div>;

  if (live.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Card>
          <CardTitle>No live journeys</CardTitle>
          <CardDescription>
            Post a journey and accept requests to see your in-trip cockpit here.
          </CardDescription>
          <div className="mt-4 flex gap-2">
            <Link to="/dashboard/journeys/new"><Button size="sm">Post a journey</Button></Link>
            <Link to="/dashboard/requests"><Button size="sm" variant="outline">Booking requests</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Journey selector */}
      {live.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {live.map((j) => {
            const active = j.id === (selected?.id ?? '');
            return (
              <button
                key={j.id}
                type="button"
                onClick={() => setSelectedId(j.id)}
                className={[
                  'shrink-0 rounded-pill px-3 h-9 text-xs font-semibold border',
                  active
                    ? 'bg-brand text-brand-fg border-brand'
                    : 'bg-bg-elevated text-text border-border hover:bg-surface-hover',
                ].join(' ')}
              >
                {j.origin_text} → {j.destination_text}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <>
          <TripHeader j={selected} bookings={bookings} onChange={refetch} />
          <PassengerList bookings={bookings} onChange={refetch} />
          <MapPlaceholder />
        </>
      )}
    </div>
  );
}

function TripHeader({
  j, bookings, onChange,
}: { j: MyJourney; bookings: BookingWithPassenger[]; onChange: () => Promise<void> | void }) {
  const toast = useToast();
  const dt = formatDateTime(j.departure_time);
  const [busy, setBusy] = useState(false);
  const boarded = bookings.filter((b) => b.status === 'boarding' || b.status === 'in_trip').length;
  const accepted = bookings.filter((b) => b.status === 'accepted').length;
  const stillToBoard = accepted;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <div className="t-caption">Departing · {dt.full}</div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-text mt-1">
            {j.origin_text} → {j.destination_text}
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile label="Aboard" value={String(boarded)} tone="brand" />
          <StatTile label="Still to board" value={String(stillToBoard)} tone={stillToBoard > 0 ? 'warning' : 'muted'} />
          <StatTile label="Seats left" value={String(j.seats_available)} />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            size="lg"
            variant="outline"
            className="sm:flex-1"
            onClick={async () => {
              try { setBusy(true); await startTrip(j.id); toast.push({ kind: 'success', message: 'Trip started.' }); await onChange(); }
              catch (err) { toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not start.' }); }
              finally { setBusy(false); }
            }}
            loading={busy}
          >
            Start trip
          </Button>
          <Button
            size="lg"
            className="sm:flex-1"
            onClick={async () => {
              if (!confirm('Complete this trip? Passengers will be able to rate you.')) return;
              try { setBusy(true); await completeTripBookings(j.id); toast.push({ kind: 'success', title: 'Trip complete', message: 'Passengers can now rate you.' }); await onChange(); }
              catch (err) { toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not complete.' }); }
              finally { setBusy(false); }
            }}
            loading={busy}
          >
            End journey
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatTile({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'brand' | 'warning' | 'muted' }) {
  const bg =
    tone === 'brand'   ? 'bg-brand/12 text-brand border-brand/25' :
    tone === 'warning' ? 'bg-warning/12 text-warning border-warning/25' :
    tone === 'muted'   ? 'bg-surface-hover text-text-muted border-border' :
                         'bg-surface text-text border-border';
  return (
    <div className={['rounded-field border p-3 text-center', bg].join(' ')}>
      <div className="text-2xl sm:text-3xl font-extrabold tabular-nums">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

function PassengerList({
  bookings, onChange,
}: { bookings: BookingWithPassenger[]; onChange: () => Promise<void> | void }) {
  if (bookings.length === 0) {
    return (
      <Card>
        <CardTitle>No passengers yet</CardTitle>
        <CardDescription>Accept requests from the Requests tab first.</CardDescription>
      </Card>
    );
  }
  return (
    <div className="grid gap-3">
      {bookings.map((b) => (
        <PassengerRow key={b.id} b={b} onChange={onChange} />
      ))}
    </div>
  );
}

function PassengerRow({ b, onChange }: { b: BookingWithPassenger; onChange: () => Promise<void> | void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'verify' | 'noshow' | 'pay' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(b.payment_status === 'manual_paid');

  const passenger = b.passenger?.full_name ?? 'Passenger';

  return (
    <Card>
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={passenger} url={b.passenger?.avatar_url ?? null} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm sm:text-base font-bold text-text truncate">{passenger}</div>
            <BookingStatusBadge status={b.status} size="sm" />
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {pluralSeats(b.seats_booked)}
            {paid && <span className="ml-2 text-brand font-semibold">· Paid (demo)</span>}
          </div>
        </div>
      </div>

      {b.status === 'accepted' && (
        <>
          <div className="mt-4 text-xs text-text-muted text-center">
            Ask the passenger to show their 4-digit boarding code.
          </div>
          <div className="mt-2">
            <CodeInput
              value={code}
              onChange={(v) => { setCode(v); if (error) setError(null); }}
              onComplete={(v) => { setCode(v); }}
              error={error}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={async () => {
                if (!confirm('Mark this passenger as no-show?')) return;
                try { setBusy('noshow'); await markNoShow(b.id); toast.push({ kind: 'info', message: 'Marked as no-show.' }); await onChange(); }
                catch (err) { toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not mark no-show.' }); }
                finally { setBusy(null); }
              }}
              loading={busy === 'noshow'}
            >
              No-show
            </Button>
            <Button
              size="lg"
              onClick={async () => {
                if (code.length !== 4) { setError('Enter the 4-digit code.'); return; }
                try {
                  setBusy('verify'); setError(null);
                  await verifyBoarding(b.id, code);
                  toast.push({ kind: 'success', message: 'Boarding confirmed.' });
                  setCode('');
                  await onChange();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not verify.');
                } finally { setBusy(null); }
              }}
              loading={busy === 'verify'}
              disabled={code.length !== 4}
            >
              Confirm aboard
            </Button>
          </div>
        </>
      )}

      {(b.status === 'boarding' || b.status === 'in_trip') && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch">
          <div className="flex-1 rounded-field bg-brand/10 border border-brand/25 p-3 text-sm text-text">
            {b.status === 'boarding' ? 'Onboarded. Waiting to start the trip.' : 'On the way. End the journey when you arrive.'}
          </div>
          <Button
            size="lg"
            variant={paid ? 'outline' : undefined}
            disabled={paid}
            loading={busy === 'pay'}
            onClick={() => {
              // Demo-only "request to pay" — a real payments integration comes
              // post-pilot. We just flip a local flag and toast the driver.
              setBusy('pay');
              setTimeout(() => {
                setPaid(true);
                toast.push({ kind: 'success', title: 'Payment requested', message: 'Demo — no real charge was made.' });
                setBusy(null);
              }, 400);
            }}
          >
            {paid ? 'Paid ✓' : 'Request to pay'}
          </Button>
        </div>
      )}
    </Card>
  );
}

function MapPlaceholder() {
  return (
    <div
      role="img"
      aria-label="Route reference"
      className="rounded-card border border-dashed border-border h-40 grid place-items-center bg-bg-elevated"
    >
      <div className="text-center px-4">
        <div className="text-2xl">🗺️</div>
        <div className="text-xs font-semibold text-text mt-1">Follow your usual route</div>
        <div className="text-[11px] text-text-muted">Live tracking isn’t on in the pilot.</div>
      </div>
    </div>
  );
}

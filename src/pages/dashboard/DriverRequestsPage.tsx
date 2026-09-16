import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { Avatar } from '@/components/layout/UserMenu';
import { useAuth } from '@/auth/useAuth';
import {
  acceptBooking, listBookingsForJourney, rejectBooking,
  type BookingWithPassenger,
} from '@/features/bookings/api';
import { listMyJourneys, type MyJourney } from '@/features/journeys/api';
import { formatDateTime, formatRWF, pluralSeats } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';

type Row = MyJourney & { requests: BookingWithPassenger[] };

export default function DriverRequestsPage() {
  const { user } = useAuth();
  const toast = useToast();

  const fetcher = useCallback(async (): Promise<Row[]> => {
    if (!user) return [];
    const journeys = await listMyJourneys(user.id);
    const withReqs: Row[] = [];
    for (const j of journeys) {
      if (j.status !== 'active' && j.status !== 'full') continue;
      if (j.bookings_count.requested === 0) continue;
      const bookings = await listBookingsForJourney(j.id);
      const pending = bookings.filter((b) => b.status === 'requested');
      if (pending.length > 0) withReqs.push({ ...j, requests: pending });
    }
    return withReqs;
  }, [user]);

  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load requests.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading, refetch } = useDataFetch<Row[]>(fetcher, [user?.id], { enabled: Boolean(user), onError });
  const rows = data ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {loading ? (
        <>
          <Skeleton heightClass="h-24" />
          <Skeleton heightClass="h-24" />
        </>
      ) : rows.length === 0 ? (
        <Card>
          <CardTitle>No new requests</CardTitle>
          <CardDescription>
            When passengers request a seat on one of your journeys, it lands here.
          </CardDescription>
          <div className="mt-4">
            <Link to="/dashboard/journeys/new"><Button>Post a journey</Button></Link>
          </div>
        </Card>
      ) : (
        rows.map((r) => (
          <JourneyGroup key={r.id} row={r} onChange={refetch} />
        ))
      )}
    </div>
  );
}

function JourneyGroup({ row, onChange }: { row: Row; onChange: () => Promise<void> | void }) {
  const dt = formatDateTime(row.departure_time);
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="t-caption">{dt.full}</div>
          <CardTitle>{row.origin_text} → {row.destination_text}</CardTitle>
        </div>
        <Link to={`/dashboard/journeys/${row.id}/manage`} className="text-sm text-brand font-semibold shrink-0">
          Manage all
        </Link>
      </div>

      <div className="mt-4 grid gap-2">
        {row.requests.map((b) => (
          <RequestRow key={b.id} booking={b} onChange={onChange} />
        ))}
      </div>
    </Card>
  );
}

function RequestRow({
  booking, onChange,
}: { booking: BookingWithPassenger; onChange: () => Promise<void> | void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const p = booking.passenger;
  return (
    <div className="rounded-field border border-border bg-bg-elevated p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={p?.full_name ?? '—'} url={p?.avatar_url ?? null} size={40} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text truncate">{p?.full_name ?? '—'}</div>
          <div className="text-xs text-text-muted">
            {pluralSeats(booking.seats_booked)} · {formatRWF(booking.contribution_amount ?? 0)}
            {p?.rating_count ? ` · ★ ${p.rating_avg.toFixed(1)}` : ''}
          </div>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm" variant="outline" loading={busy === 'reject'}
          onClick={async () => {
            try { setBusy('reject'); await rejectBooking(booking.id); toast.push({ kind: 'info', message: 'Rejected.' }); await onChange(); }
            catch (err) { toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not reject.' }); }
            finally { setBusy(null); }
          }}
        >
          Reject
        </Button>
        <Button
          size="sm" loading={busy === 'accept'}
          onClick={async () => {
            try { setBusy('accept'); await acceptBooking(booking.id); toast.push({ kind: 'success', title: 'Accepted', message: 'Boarding code sent to passenger.' }); await onChange(); }
            catch (err) { toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not accept.' }); }
            finally { setBusy(null); }
          }}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}

// exported for testing; not used inline elsewhere
export const __ROW_TYPE__ = null as unknown as Row;

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import { cancelJourney, listMyJourneys, type MyJourney } from '@/features/journeys/api';
import { formatDateTime, formatRWF, pluralSeats } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';

export default function MyJourneysPage() {
  const { user } = useAuth();
  const toast = useToast();

  const fetcher = useCallback(async () => {
    if (!user) return [];
    return listMyJourneys(user.id);
  }, [user]);

  const onError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not load your journeys.';
      toast.push({ kind: 'error', message: msg });
    },
    [toast],
  );

  const { data, loading, refreshing, refetch } = useDataFetch<MyJourney[]>(
    fetcher,
    [user?.id],
    { enabled: Boolean(user), onError },
  );

  const all = data ?? [];
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const { active, history } = useMemo(() => ({
    active: all.filter((j) => j.status === 'active' || j.status === 'full'),
    history: all.filter((j) => j.status === 'completed' || j.status === 'cancelled'),
  }), [all]);
  const rows = tab === 'active' ? active : history;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="t-caption">Driver</div>
          <h1 className="t-h1 text-text mt-1">My journeys</h1>
        </div>
        <Link to="/dashboard/journeys/new">
          <Button size="sm">Post a journey</Button>
        </Link>
      </header>

      {refreshing && (
        <div className="text-xs text-text-muted -mt-2" aria-live="polite">
          Refreshing…
        </div>
      )}

      <div className="flex items-center gap-1 rounded-pill border border-border bg-bg-elevated p-1 w-fit">
        <TabChip active={tab === 'active'}  onClick={() => setTab('active')}  label={`Active${active.length ? ` (${active.length})` : ''}`} />
        <TabChip active={tab === 'history'} onClick={() => setTab('history')} label={`History${history.length ? ` (${history.length})` : ''}`} />
      </div>

      {loading ? (
        <div className="grid gap-3" aria-busy="true">
          <MyJourneySkeletonRow />
          <MyJourneySkeletonRow />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardTitle>
            {tab === 'active' ? "No active journeys" : 'No past journeys yet'}
          </CardTitle>
          <CardDescription>
            {tab === 'active'
              ? "Post your first trip and passengers will find it right away."
              : 'Completed and cancelled journeys will appear here.'}
          </CardDescription>
          {tab === 'active' && (
            <div className="mt-4">
              <Link to="/dashboard/journeys/new"><Button>Post a journey</Button></Link>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((j) => (
            <MyJourneyRow key={j.id} j={j} onCancelled={refetch} />
          ))}
        </div>
      )}
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

function MyJourneyRow({ j, onCancelled }: { j: MyJourney; onCancelled: () => void }) {
  const toast = useToast();
  const dt = formatDateTime(j.departure_time);
  const [busy, setBusy] = useState(false);

  async function onCancel() {
    if (!confirm('Cancel this journey? Passengers who requested it will be notified.')) return;
    try {
      setBusy(true);
      await cancelJourney(j.id);
      toast.push({ kind: 'success', message: 'Journey cancelled.' });
      await onCancelled();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not cancel.';
      toast.push({ kind: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col sm:flex-row gap-4 sm:items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>{dt.full}</span>
            <StatusBadge status={j.status} />
          </div>
          <div className="mt-2 text-sm font-semibold text-text truncate">
            {j.origin_text} → {j.destination_text}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {j.vehicle ? `${j.vehicle.make} ${j.vehicle.model}${j.vehicle.energy_type === 'electric' ? ' ⚡' : ''}` : 'No vehicle'}
            {' · '}
            {pluralSeats(j.seats_available)} left of {j.seats_total}
            {' · '}
            {formatRWF((j.contribution_per_seat ?? j.suggested_contribution))} / seat
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <RequestsChip label="Requests" count={j.bookings_count.requested} tone="accent" />
            <RequestsChip label="Accepted" count={j.bookings_count.accepted} tone="brand" />
            <span className="text-text-muted">·</span>
            <Link to={`/journeys/${j.id}/manage`} className="text-brand font-semibold hover:text-brand-hover">Manage bookings</Link>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Link to={`/journeys/${j.id}`}>
            <Button size="sm" variant="outline">View</Button>
          </Link>
          {j.status === 'active' && (
            <Button size="sm" variant="danger" onClick={onCancel} loading={busy}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Skeleton that mirrors MyJourneyRow's actual layout so there's no size jump
 * when real content lands.
 */
function MyJourneySkeletonRow() {
  return (
    <Card>
      <div className="flex flex-col sm:flex-row gap-4 sm:items-start justify-between">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton widthClass="w-32" heightClass="h-3.5" />
            <Skeleton shape="pill" widthClass="w-14" heightClass="h-5" />
          </div>
          <Skeleton widthClass="w-3/5" heightClass="h-4" />
          <Skeleton widthClass="w-4/5" heightClass="h-3" />
          <div className="flex items-center gap-2 pt-1">
            <Skeleton shape="pill" widthClass="w-24" heightClass="h-6" />
            <Skeleton shape="pill" widthClass="w-24" heightClass="h-6" />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Skeleton widthClass="w-16" heightClass="h-9" />
          <Skeleton widthClass="w-20" heightClass="h-9" />
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: MyJourney['status'] }) {
  const map: Record<MyJourney['status'], { label: string; cls: string }> = {
    active:    { label: 'Active',    cls: 'bg-brand/15 text-brand' },
    full:      { label: 'Full',      cls: 'bg-warning/15 text-warning' },
    cancelled: { label: 'Cancelled', cls: 'bg-danger/15 text-danger' },
    completed: { label: 'Completed', cls: 'bg-surface-hover text-text-muted' },
  };
  const m = map[status];
  return (
    <span className={['inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider', m.cls].join(' ')}>
      {m.label}
    </span>
  );
}

function RequestsChip({ label, count, tone }: { label: string; count: number; tone: 'brand' | 'accent' }) {
  const bg = tone === 'brand'
    ? 'bg-brand/15 text-brand border border-brand/25'
    : 'bg-warning/15 text-warning border border-warning/25';
  return (
    <span className={['inline-flex items-center gap-1 px-2 h-6 rounded-pill font-semibold', bg].join(' ')}>
      <span className="opacity-80">{label}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

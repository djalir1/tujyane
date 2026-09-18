/**
 * Small admin surfaces: Drivers, Journeys, Bookings, Contributions,
 * plus Live and Payments status pages.
 *
 * All data comes from admin_* RPCs (SECURITY DEFINER, `not_admin` guard).
 * Non-admins are refused at the SQL layer AND blocked by the AdminRoute gate.
 *
 * Reports and Settings each live in their own file now.
 */
import { useCallback } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { Avatar } from '@/components/layout/UserMenu';
import {
  listAdminDrivers, listAdminJourneys, listAdminBookings, loadContributionSummary,
  type AdminDriverRow, type AdminJourneyRow, type AdminBookingRow, type ContributionSummary,
} from '@/features/admin/api';
import { useDataFetch } from '@/lib/useDataFetch';
import { formatRWF } from '@/lib/format';

export function AdminDriversPage() {
  const toast = useToast();
  const fetcher = useCallback(() => listAdminDrivers(200), []);
  const onError = useCallback((err: unknown) => toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Load failed.' }), [toast]);
  const { data, loading } = useDataFetch<AdminDriverRow[]>(fetcher, [], { onError });
  const rows = data ?? [];

  if (loading) return <ListSkeleton />;
  if (rows.length === 0) return <EmptyState title="No drivers yet" desc="When someone signs up as a driver they'll appear here." />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-3">
      {rows.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={r.full_name} url={r.avatar_url} size={40} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text truncate flex items-center gap-1.5">
                  {r.full_name}
                  {r.is_demo && <DemoTag />}
                </div>
                <div className="text-xs text-text-muted">
                  {r.phone ?? '—'} · {r.vehicles_count} vehicle{r.vehicles_count === 1 ? '' : 's'} ({r.verified_vehicles} verified)
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {r.is_verified_driver
                ? <span className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand">verified</span>
                : <span className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-warning/15 text-warning">unverified</span>}
              <span className="text-xs text-text-muted">{r.active_journeys}/{r.journeys_count} journeys</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function AdminJourneysPage() {
  const toast = useToast();
  const fetcher = useCallback(() => listAdminJourneys(200), []);
  const onError = useCallback((err: unknown) => toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Load failed.' }), [toast]);
  const { data, loading } = useDataFetch<AdminJourneyRow[]>(fetcher, [], { onError });
  const rows = data ?? [];

  if (loading) return <ListSkeleton />;
  if (rows.length === 0) return <EmptyState title="No journeys" desc="Drivers haven't posted any journeys yet." />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <Card padded={false}>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-text-muted">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-semibold">When</th>
                <th className="text-left px-4 py-3 font-semibold">Route</th>
                <th className="text-left px-4 py-3 font-semibold">Driver</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-text-muted">{whenShort(r.departure_time)}</td>
                  <td className="px-4 py-2.5 text-text">{r.origin_text} → {r.destination_text}</td>
                  <td className="px-4 py-2.5 text-text-muted">{r.driver_name}</td>
                  <td className="px-4 py-2.5"><StatusPill s={r.status} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">
                    {formatRWF(r.contribution_per_seat ?? r.suggested_contribution)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="md:hidden divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3">
              <div className="text-xs text-text-muted">{whenShort(r.departure_time)}</div>
              <div className="text-sm font-semibold text-text truncate">{r.origin_text} → {r.destination_text}</div>
              <div className="text-xs text-text-muted flex items-center justify-between gap-2 mt-1">
                <span className="truncate">{r.driver_name}</span>
                <StatusPill s={r.status} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function AdminBookingsPage() {
  const toast = useToast();
  const fetcher = useCallback(() => listAdminBookings(200), []);
  const onError = useCallback((err: unknown) => toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Load failed.' }), [toast]);
  const { data, loading } = useDataFetch<AdminBookingRow[]>(fetcher, [], { onError });
  const rows = data ?? [];

  if (loading) return <ListSkeleton />;
  if (rows.length === 0) return <EmptyState title="No bookings" desc="Passengers haven't booked any rides yet." />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <Card padded={false}>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-text-muted">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-semibold">When</th>
                <th className="text-left px-4 py-3 font-semibold">Passenger → Driver</th>
                <th className="text-left px-4 py-3 font-semibold">Route</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">{whenShort(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-text">{r.passenger_name} → {r.driver_name}</td>
                  <td className="px-4 py-2.5 text-text-muted">{r.origin_text} → {r.destination_text}</td>
                  <td className="px-4 py-2.5"><StatusPill s={r.status} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">{formatRWF(r.contribution_amount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="md:hidden divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3">
              <div className="text-xs text-text-muted">{whenShort(r.created_at)}</div>
              <div className="text-sm font-semibold text-text truncate">{r.passenger_name} → {r.driver_name}</div>
              <div className="text-xs text-text-muted flex items-center justify-between gap-2 mt-1">
                <span className="truncate">{r.origin_text} → {r.destination_text}</span>
                <StatusPill s={r.status} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function AdminContributionsPage() {
  const toast = useToast();
  const fetcher = useCallback(() => loadContributionSummary(), []);
  const onError = useCallback((err: unknown) => toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Load failed.' }), [toast]);
  const { data, loading } = useDataFetch<ContributionSummary>(fetcher, [], { onError });

  if (loading || !data) return <ListSkeleton />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Tile label="Completed rides" value={String(data.completed_rides)} />
        <Tile label="Contributions total" value={formatRWF(data.contribution_rwf)} tone="brand" />
        <Tile label="Average" value={formatRWF(data.average_rwf)} />
        <Tile label="Manual-paid" value={String(data.pending_manual_paid)} />
      </div>
      <Card>
        <CardTitle>Payments in-app: not live</CardTitle>
        <CardDescription>
          Contributions are recorded but no money moves inside TUJYANE yet — drivers and passengers
          settle in cash or with MoMo directly. These figures are the running total from completed bookings.
        </CardDescription>
      </Card>
    </div>
  );
}

export function AdminLivePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
      <Card>
        <CardTitle>Live tracking is off</CardTitle>
        <CardDescription>
          TUJYANE doesn’t track vehicles on a map in the pilot. To see what’s happening right now, use the
          Journeys and Bookings tables (filter by status <em>in_trip</em> or <em>boarding</em>) and the audit
          log for the timeline of driver / passenger actions.
        </CardDescription>
      </Card>
    </div>
  );
}

export function AdminPaymentsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
      <Card>
        <CardTitle>Payments aren’t held by TUJYANE</CardTitle>
        <CardDescription>
          Contributions are recorded per booking but drivers and passengers settle directly (cash or MoMo).
          When an in-app payment provider is integrated, this dashboard will show settlement batches,
          refunds, and reconciliation. For now, use the Contributions tab for aggregate numbers.
        </CardDescription>
      </Card>
    </div>
  );
}

/* ---------- Small building blocks ---------- */
function Tile({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'brand' }) {
  const bg = tone === 'brand' ? 'bg-brand/10 border-brand/25 text-brand' : 'bg-surface border-border text-text';
  return (
    <div className={['rounded-card border p-4', bg].join(' ')}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-2">
      <Skeleton heightClass="h-14" />
      <Skeleton heightClass="h-14" />
      <Skeleton heightClass="h-14" />
    </div>
  );
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <Card>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </Card>
    </div>
  );
}

function DemoTag() {
  return (
    <span className="inline-flex items-center h-4 px-1.5 rounded-[6px] text-[9px] font-bold tracking-wider uppercase bg-warning/15 text-warning">
      demo
    </span>
  );
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, string> = {
    active:'bg-brand/15 text-brand', full:'bg-warning/15 text-warning',
    cancelled:'bg-danger/15 text-danger', completed:'bg-surface-hover text-text-muted',
    requested:'bg-warning/15 text-warning', accepted:'bg-brand/15 text-brand',
    boarding:'bg-brand/15 text-brand', in_trip:'bg-brand/15 text-brand',
    rejected:'bg-danger/15 text-danger', no_show:'bg-danger/15 text-danger',
  };
  const cls = map[s] ?? 'bg-surface-hover text-text-muted';
  return (
    <span className={['inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider', cls].join(' ')}>
      {s.replace('_',' ')}
    </span>
  );
}

function whenShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

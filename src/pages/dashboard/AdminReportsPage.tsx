import { useCallback, useMemo } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useDataFetch } from '@/lib/useDataFetch';
import { loadReportsSummary, type AdminReportsSummary } from '@/features/admin/api';
import { formatRWF } from '@/lib/format';

/**
 * Real reports dashboard.
 *
 * One call to admin_reports_summary hydrates every tile so a page refresh is a
 * single RPC round-trip. Each numeric tile also becomes one CSV row on export.
 */
export default function AdminReportsPage() {
  const toast = useToast();
  const fetcher = useCallback(() => loadReportsSummary(), []);
  const onError = useCallback(
    (err: unknown) => toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Load failed.' }),
    [toast],
  );
  const { data, loading, refreshing, refetch } = useDataFetch<AdminReportsSummary>(fetcher, [], { onError });

  const funnelRatio = useMemo(() => {
    if (!data) return { personal: 0, vehicle: 0 };
    const p = data.verification_funnel;
    return {
      personal: p.personal_submitted ? Math.round((p.personal_approved / p.personal_submitted) * 100) : 0,
      vehicle:  p.vehicles_submitted ? Math.round((p.vehicles_approved / p.vehicles_submitted) * 100) : 0,
    };
  }, [data]);

  function onDownloadCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [
      ['metric', 'value'],
      ['generated_at', data.generated_at],
      ['total_users', data.total_users],
      ['active_drivers', data.active_drivers],
      ['total_vehicles', data.total_vehicles],
      ['verified_vehicles', data.verified_vehicles],
      ['total_journeys', data.total_journeys],
      ['active_journeys', data.active_journeys],
      ['total_bookings', data.total_bookings],
      ['completed_bookings', data.completed_bookings],
      ['contribution_total_rwf', data.contribution_total_rwf],
      ['contribution_avg_rwf', data.contribution_avg_rwf],
      ['personal_submitted', data.verification_funnel.personal_submitted],
      ['personal_approved',  data.verification_funnel.personal_approved],
      ['personal_rejected',  data.verification_funnel.personal_rejected],
      ['vehicles_submitted', data.verification_funnel.vehicles_submitted],
      ['vehicles_approved',  data.verification_funnel.vehicles_approved],
      [],
      ['iso_week', 'rides'],
      ...data.rides_by_iso_week.map((w) => [w.week, w.rides]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tujyane-report-${stamp}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  if (loading || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} heightClass="h-20" />)}
        </div>
        <Skeleton heightClass="h-56" />
      </div>
    );
  }

  const rides = data.rides_by_iso_week;
  const maxRides = rides.reduce((m, r) => Math.max(m, r.rides), 0) || 1;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="t-caption">Reports</div>
          <h1 className="t-h2 text-text">Pilot dashboard</h1>
          <p className="text-xs text-text-muted mt-1">
            Generated {new Date(data.generated_at).toLocaleString()} {refreshing && '· refreshing…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void refetch()}>Refresh</Button>
          <Button onClick={onDownloadCsv}>Download CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total users"        value={String(data.total_users)} />
        <Tile label="Active drivers"     value={String(data.active_drivers)} />
        <Tile label="Vehicles verified"  value={`${data.verified_vehicles} / ${data.total_vehicles}`} />
        <Tile label="Active journeys"    value={`${data.active_journeys} / ${data.total_journeys}`} />
        <Tile label="Total bookings"     value={String(data.total_bookings)} />
        <Tile label="Completed rides"    value={String(data.completed_bookings)} tone="brand" />
        <Tile label="Contribution total" value={formatRWF(data.contribution_total_rwf)} tone="brand" />
        <Tile label="Avg contribution"   value={formatRWF(data.contribution_avg_rwf)} />
      </div>

      <Card>
        <CardTitle>Rides per ISO week</CardTitle>
        <CardDescription>Last {rides.length} weeks with recorded rides (active + completed).</CardDescription>
        {rides.length === 0 ? (
          <div className="mt-4 text-sm text-text-muted">No journeys posted yet.</div>
        ) : (
          <ul className="mt-4 space-y-2">
            {rides.map((r) => (
              <li key={r.week} className="flex items-center gap-3 text-sm">
                <span className="w-16 tabular-nums text-text-muted">{r.week}</span>
                <div className="flex-1 h-3 rounded-pill bg-bg overflow-hidden">
                  <div className="h-full bg-brand" style={{ width: `${(r.rides / maxRides) * 100}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums font-semibold text-text">{r.rides}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Verification funnel</CardTitle>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FunnelBlock
            heading="Personal (ID + licence)"
            submitted={data.verification_funnel.personal_submitted}
            approved={data.verification_funnel.personal_approved}
            rejected={data.verification_funnel.personal_rejected}
            ratioPct={funnelRatio.personal}
          />
          <FunnelBlock
            heading="Vehicles"
            submitted={data.verification_funnel.vehicles_submitted}
            approved={data.verification_funnel.vehicles_approved}
            rejected={0}
            ratioPct={funnelRatio.vehicle}
          />
        </div>
      </Card>
    </div>
  );
}

function csvCell(v: string | number): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function Tile({
  label, value, tone = 'default',
}: { label: string; value: string; tone?: 'default' | 'brand' }) {
  const bg = tone === 'brand' ? 'bg-brand/10 border-brand/25 text-brand' : 'bg-surface border-border text-text';
  return (
    <div className={['rounded-card border p-4', bg].join(' ')}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function FunnelBlock({
  heading, submitted, approved, rejected, ratioPct,
}: { heading: string; submitted: number; approved: number; rejected: number; ratioPct: number }) {
  return (
    <div className="rounded-card border border-border bg-bg p-4">
      <div className="text-xs font-semibold text-text-muted">{heading}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-text tabular-nums">{approved}</span>
        <span className="text-xs text-text-muted">approved / {submitted} submitted</span>
      </div>
      <div className="mt-1 text-xs text-text-muted">{rejected > 0 && `${rejected} rejected · `}{ratioPct}% pass-through</div>
      <div className="mt-3 h-2 rounded-pill bg-surface-hover overflow-hidden">
        <div className="h-full bg-brand" style={{ width: `${Math.min(100, ratioPct)}%` }} />
      </div>
    </div>
  );
}

import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { loadAdminStats, loadRecentActivity, type AdminRecentActivity, type AdminStats } from '@/features/admin/api';
import { useDataFetch } from '@/lib/useDataFetch';

type Bundle = { stats: AdminStats; recent: AdminRecentActivity };

export default function AdminOverviewPage() {
  const toast = useToast();
  const fetcher = useCallback(async (): Promise<Bundle> => {
    const [stats, recent] = await Promise.all([loadAdminStats(), loadRecentActivity()]);
    return { stats, recent };
  }, []);
  const onError = useCallback((err: unknown) => {
    toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load stats.' });
  }, [toast]);

  const { data, loading } = useDataFetch<Bundle>(fetcher, [], { onError });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {loading || !data ? (
        <>
          <Skeleton heightClass="h-24" />
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} heightClass="h-24" />)}
          </div>
        </>
      ) : (
        <>
          <SinceStrip r={data.recent} />

          <section className="space-y-2">
            <h2 className="t-h3 text-text">Platform totals</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <StatCard label="Verified drivers" value={data.stats.verified_drivers} tone="brand" />
              <StatCard label="Drivers pending" value={data.stats.drivers_pending_verification} tone={data.stats.drivers_pending_verification > 0 ? 'warning' : 'muted'} />
              <StatCard label="Active journeys" value={data.stats.active_journeys} tone="brand" />
              <StatCard label="Total journeys" value={data.stats.total_journeys} />
              <StatCard label="Total bookings" value={data.stats.total_bookings} />
              <StatCard label="Completed" value={data.stats.completed_bookings} tone="brand" />
              <StatCard label="Total drivers" value={data.stats.total_drivers} />
              <StatCard label="Total users" value={data.stats.total_users} />
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Review queue</CardTitle>
                  <CardDescription>Drivers waiting on their KYC.</CardDescription>
                </div>
                <Link to="/admin/queue"><Button>Open queue</Button></Link>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Audit log</CardTitle>
                  <CardDescription>Who did what, when.</CardDescription>
                </div>
                <Link to="/admin/audit"><Button variant="outline">Open</Button></Link>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SinceStrip({ r }: { r: AdminRecentActivity }) {
  const since = new Date(r.since);
  const rel = timeAgo(since);
  const items: Array<{ label: string; value: number; tone?: 'brand' | 'warning' }> = [
    { label: 'New users',         value: r.new_users },
    { label: 'New journeys',      value: r.new_journeys, tone: 'brand' },
    { label: 'New bookings',      value: r.new_bookings, tone: 'brand' },
    { label: 'Pending KYC',       value: r.pending_docs, tone: r.pending_docs > 0 ? 'warning' : undefined },
    { label: 'New ratings',       value: r.new_ratings },
  ];
  return (
    <div className="rounded-card p-4 sm:p-5 bg-navy text-white shadow-elevate relative overflow-hidden">
      <div className="t-caption text-white/70">Since your last visit</div>
      <div className="text-sm mt-1 text-white/80">
        Since {since.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {rel}
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {items.map((it) => (
          <div key={it.label} className={[
            'rounded-field px-3 py-2 border',
            it.tone === 'brand' ? 'bg-brand/15 border-brand/30' :
            it.tone === 'warning' ? 'bg-warning/15 border-warning/30' :
            'bg-white/5 border-white/10',
          ].join(' ')}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/70">{it.label}</div>
            <div className="text-2xl font-bold tabular-nums text-white">{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'brand' | 'warning' | 'muted' }) {
  const bg =
    tone === 'brand'   ? 'bg-brand/10 border-brand/25 text-brand' :
    tone === 'warning' ? 'bg-warning/10 border-warning/25 text-warning' :
    tone === 'muted'   ? 'bg-surface-hover border-border text-text-muted' :
                         'bg-surface border-border text-text';
  return (
    <div className={['rounded-card border p-4', bg].join(' ')}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { listReviewQueue, type QueueEntry } from '@/features/admin/api';
import { useDataFetch } from '@/lib/useDataFetch';

export default function AdminQueuePage() {
  const toast = useToast();

  const fetcher = useCallback(async () => await listReviewQueue(), []);
  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load the queue.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading, refetch } = useDataFetch<QueueEntry[]>(
    fetcher, [], { onError });
  const rows = data ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="t-caption">Admin</div>
          <h1 className="t-h1 text-text mt-1">Review queue</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Refresh</Button>
      </header>

      {loading ? (
        <div className="grid gap-3">
          <QueueSkeletonRow /><QueueSkeletonRow /><QueueSkeletonRow />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardTitle>Nothing to review</CardTitle>
          <CardDescription>Pending driver documents will show up here.</CardDescription>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => <QueueRow key={r.driver_id} entry={r} />)}
        </div>
      )}
    </div>
  );
}

function QueueRow({ entry }: { entry: QueueEntry }) {
  const submitted = entry.latest_submitted_at
    ? new Date(entry.latest_submitted_at).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';
  const draftOnly = entry.pending_count === 0 && entry.draft_count > 0;
  return (
    <Card>
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text truncate">
            {entry.full_name}
            {entry.is_verified_driver && <span className="ml-1 text-xs text-brand">· personal verified</span>}
          </div>
          <div className="text-xs text-text-muted">
            {entry.phone ?? '—'} · last activity {submitted}
            {draftOnly && <> · <span className="text-warning font-semibold">driver has not sent for review yet</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {entry.pending_count > 0 && (
            <span className="inline-flex items-center h-6 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-warning/15 text-warning">
              {entry.pending_count} pending
            </span>
          )}
          {entry.draft_count > 0 && (
            <span className="inline-flex items-center h-6 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-surface-hover text-text-muted">
              {entry.draft_count} draft
            </span>
          )}
          <Link to={`/admin/drivers/${entry.driver_id}`}>
            <Button size="sm">Review</Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function QueueSkeletonRow() {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton widthClass="w-40" heightClass="h-4" />
          <Skeleton widthClass="w-3/5" heightClass="h-3" />
        </div>
        <Skeleton shape="pill" widthClass="w-20" heightClass="h-6" />
        <Skeleton widthClass="w-16" heightClass="h-9" />
      </div>
    </Card>
  );
}

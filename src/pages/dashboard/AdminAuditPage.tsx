import { useCallback } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { listAuditEvents, type AuditEvent } from '@/features/admin/api';
import { useDataFetch } from '@/lib/useDataFetch';

/**
 * Who-did-what accountability log. All rows come from the audit_events table
 * written by the SECURITY DEFINER RPCs and triggers.
 */
export default function AdminAuditPage() {
  const toast = useToast();
  const fetcher = useCallback(async () => await listAuditEvents(200), []);
  const onError = useCallback((err: unknown) => {
    toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load audit.' });
  }, [toast]);
  const { data, loading } = useDataFetch<AuditEvent[]>(fetcher, [], { onError });
  const rows = data ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {loading ? (
        <>
          <Skeleton heightClass="h-12" />
          <Skeleton heightClass="h-12" />
          <Skeleton heightClass="h-12" />
        </>
      ) : rows.length === 0 ? (
        <Card>
          <CardTitle>Quiet day.</CardTitle>
          <CardDescription>No audit events yet — the log fills as people post, request, accept and verify.</CardDescription>
        </Card>
      ) : (
        <Card padded={false}>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-text-muted">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 font-semibold">When</th>
                  <th className="text-left px-4 py-3 font-semibold">Actor</th>
                  <th className="text-left px-4 py-3 font-semibold">Action</th>
                  <th className="text-left px-4 py-3 font-semibold">Entity</th>
                  <th className="text-left px-4 py-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 whitespace-nowrap text-text-muted text-xs">{formatWhen(e.created_at)}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-text">{shortId(e.actor_id)}</td>
                    <td className="px-4 py-2.5"><ActionBadge action={e.action} /></td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="text-text-muted">{e.entity_type}</span>
                      {' · '}<span className="tabular-nums text-text">{shortId(e.entity_id)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-text-muted">
                      {formatMeta(e.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden divide-y divide-border">
            {rows.map((e) => (
              <li key={e.id} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ActionBadge action={e.action} />
                  <span className="text-[10px] text-text-muted ml-auto">{formatWhen(e.created_at)}</span>
                </div>
                <div className="text-xs text-text-muted">
                  Actor <span className="text-text tabular-nums">{shortId(e.actor_id)}</span>
                </div>
                <div className="text-xs text-text-muted">
                  {e.entity_type} <span className="text-text tabular-nums">{shortId(e.entity_id)}</span>
                </div>
                <div className="text-xs text-text-muted mt-1">{formatMeta(e.metadata)}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  let cls = 'bg-surface-hover text-text-muted';
  if (action.endsWith('.approved')) cls = 'bg-brand/15 text-brand';
  else if (action.endsWith('.rejected')) cls = 'bg-danger/15 text-danger';
  else if (action.endsWith('.accepted')) cls = 'bg-brand/15 text-brand';
  else if (action.endsWith('.requested')) cls = 'bg-warning/15 text-warning';
  else if (action.endsWith('.posted')) cls = 'bg-navy/15 text-text';
  else if (action.endsWith('.boarding')) cls = 'bg-brand/15 text-brand';
  return (
    <span className={['inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider', cls].join(' ')}>
      {action}
    </span>
  );
}

function formatMeta(m: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (v == null) continue;
    let s = String(v);
    if (s.length > 10 && /-/.test(s)) s = s.slice(0, 8) + '…';
    parts.push(`${k}=${s}`);
  }
  return parts.slice(0, 4).join(' · ') || '—';
}

function shortId(id: string | null): string {
  if (!id) return '—';
  return id.slice(0, 8);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

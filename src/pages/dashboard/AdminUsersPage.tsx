import { useCallback, useMemo, useState } from 'react';
import { Card } from '@/components/ds/Card';
import { TextField } from '@/components/ds/TextField';
import { Toggle } from '@/components/ds/Toggle';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { Avatar } from '@/components/layout/UserMenu';
import { useDataFetch } from '@/lib/useDataFetch';
import { listAdminUsers, type AdminUserRow } from '@/features/admin/api';

export default function AdminUsersPage() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [hideDemo, setHideDemo] = useState(true);

  const fetcher = useCallback(async () => await listAdminUsers(200), []);
  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load users.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading } = useDataFetch<AdminUserRow[]>(fetcher, [], { onError });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = data ?? [];
    if (hideDemo) rows = rows.filter((r) => !r.is_demo);
    if (q) rows = rows.filter((r) =>
      r.full_name.toLowerCase().includes(q) ||
      (r.phone ?? '').toLowerCase().includes(q)
    );
    return rows;
  }, [data, query, hideDemo]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <Card className="!p-4 sm:!p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <TextField
            label="Search"
            placeholder="Name or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Toggle
            checked={hideDemo}
            onChange={setHideDemo}
            label="Hide demo accounts"
            description="Seeded demo users are excluded when on."
          />
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} heightClass="h-14" />
          ))}
        </div>
      ) : (
        <Card padded={false}>
          {/* Table view on md+, stacked cards on mobile */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-text-muted">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 font-semibold">User</th>
                  <th className="text-left px-4 py-3 font-semibold">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold">Role</th>
                  <th className="text-left px-4 py-3 font-semibold">Verified</th>
                  <th className="text-right px-4 py-3 font-semibold">Rating</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={u.full_name} url={u.avatar_url} size={32} />
                        <span className="text-text font-medium truncate flex items-center gap-1.5">
                          {u.full_name}
                          {u.is_demo && (
                            <span className="inline-flex items-center h-4 px-1.5 rounded-[6px] text-[9px] font-bold uppercase bg-warning/15 text-warning">
                              demo
                            </span>
                          )}
                          {u.is_disabled && (
                            <span className="inline-flex items-center h-4 px-1.5 rounded-[6px] text-[9px] font-bold uppercase bg-danger-soft text-danger">
                              disabled
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{u.phone ?? '—'}</td>
                    <td className="px-4 py-3 capitalize">{u.role_intent}</td>
                    <td className="px-4 py-3">
                      {u.is_verified_driver ? (
                        <span className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand">Verified</span>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {u.rating_count ? `${u.rating_avg.toFixed(1)} (${u.rating_count})` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden divide-y divide-border">
            {filtered.map((u) => (
              <li key={u.id} className="p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={u.full_name} url={u.avatar_url} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text truncate flex items-center gap-1.5">
                      <span className="truncate">{u.full_name}</span>
                      {u.is_demo && (
                        <span className="shrink-0 inline-flex items-center h-4 px-1.5 rounded-[6px] text-[9px] font-bold uppercase bg-warning/15 text-warning">demo</span>
                      )}
                      {u.is_disabled && (
                        <span className="shrink-0 inline-flex items-center h-4 px-1.5 rounded-[6px] text-[9px] font-bold uppercase bg-danger-soft text-danger">disabled</span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {u.phone ?? '—'} · <span className="capitalize">{u.role_intent}</span>
                      {u.rating_count ? ` · ★ ${u.rating_avg.toFixed(1)}` : ''}
                    </div>
                  </div>
                  {u.is_verified_driver && (
                    <span className="shrink-0 inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand">✓</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {filtered.length === 0 && (
            <div className="p-6 text-sm text-text-muted">No matching users.</div>
          )}
        </Card>
      )}
    </div>
  );
}

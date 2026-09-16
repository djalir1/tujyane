import { useCallback } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import { supabase } from '@/lib/supabase';
import { formatRWF } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';

type EarningsRow = {
  id: string;
  origin_text: string;
  destination_text: string;
  departure_time: string;
  contribution_amount: number | null;
  passenger_name: string;
};
type Bundle = { rows: EarningsRow[]; total: number; count: number };

/**
 * Driver earnings — clearly labelled "demo figures". Not real money; TUJYANE
 * doesn't process payments (payment_status stays unpaid/manual until Phase 12).
 */
export default function DriverEarningsPage() {
  const { user } = useAuth();
  const toast = useToast();

  const fetcher = useCallback(async (): Promise<Bundle> => {
    if (!user) return { rows: [], total: 0, count: 0 };
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, status, contribution_amount, created_at,
        journey:journeys!bookings_journey_id_fkey (id, driver_id, origin_text, destination_text, departure_time),
        passenger:profiles!bookings_passenger_id_fkey (full_name)
      `)
      .eq('status', 'completed');
    if (error) throw error;
    const rows = (data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b.journey?.driver_id === user.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any): EarningsRow => ({
        id: b.id,
        origin_text: b.journey?.origin_text ?? '',
        destination_text: b.journey?.destination_text ?? '',
        departure_time: b.journey?.departure_time ?? b.created_at,
        contribution_amount: b.contribution_amount,
        passenger_name: b.passenger?.full_name ?? '—',
      }));
    const total = rows.reduce((s, r) => s + (r.contribution_amount ?? 0), 0);
    return { rows, total, count: rows.length };
  }, [user]);

  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load earnings.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading } = useDataFetch<Bundle>(fetcher, [user?.id], { enabled: Boolean(user), onError });

  if (loading || !data) {
    return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-3"><Skeleton heightClass="h-24"/><Skeleton heightClass="h-16"/></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="t-caption">Demo figures</div>
            <CardTitle>Contributions received</CardTitle>
            <CardDescription>
              Sum of passenger contributions on completed trips. No real money moves — MoMo settlement is Phase 12.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums text-text">{formatRWF(data.total)}</div>
            <div className="text-xs text-text-muted">{data.count} completed trip{data.count === 1 ? '' : 's'}</div>
          </div>
        </div>
      </Card>

      {data.rows.length === 0 ? (
        <Card>
          <CardTitle>No completed trips yet</CardTitle>
          <CardDescription>Once you finish a trip, its contribution appears here.</CardDescription>
        </Card>
      ) : (
        <div className="grid gap-2">
          {data.rows.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text truncate">
                    {r.origin_text} → {r.destination_text}
                  </div>
                  <div className="text-xs text-text-muted">
                    {new Date(r.departure_time).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{r.passenger_name}
                  </div>
                </div>
                <div className="text-lg font-bold tabular-nums text-text shrink-0">
                  {formatRWF(r.contribution_amount ?? 0)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { useDataFetch } from '@/lib/useDataFetch';
import {
  adminDeleteCorridorFare, adminListCorridorFares, adminSetCorridorFare,
  adminUpdatePricingConfig, type CorridorFareRow, type PricingConfigRow,
} from '@/features/admin/api';
import {
  invalidateCorridorFaresCache, listLocations, loadPricingConfig, type Location,
} from '@/features/locations/api';
import { formatRWF } from '@/lib/format';

/**
 * Admin platform controls.
 *
 * Two cards, both wired to real RPCs:
 *   1. Pricing config — the singleton row that drives suggested contribution.
 *   2. Corridor bus-fare references — the ceiling used to cap prices and to
 *      show the "Cheaper than the bus · save X%" chip.
 *
 * Writes go through admin_* SECURITY DEFINER RPCs; non-admins are refused at
 * the SQL layer. On save we invalidate the client-side corridor cache so the
 * next JourneyCard render reflects the new fares immediately.
 */
export default function AdminSettingsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <PricingConfigCard />
      <CorridorFaresCard />
    </div>
  );
}

/* ─────────── Pricing config ─────────── */

function PricingConfigCard() {
  const toast = useToast();
  const fetcher = useCallback(() => loadPricingConfig(), []);
  const onError = useCallback(
    (err: unknown) => toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Load failed.' }),
    [toast],
  );
  const { data, loading, refetch } = useDataFetch<PricingConfigRow>(fetcher, [], { onError });

  const [draft, setDraft] = useState<PricingConfigRow | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setDraft(data); }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return (Object.keys(data) as (keyof PricingConfigRow)[]).some((k) => data[k] !== draft[k]);
  }, [data, draft]);

  async function onSave() {
    if (!draft) return;
    // Basic client-side sanity — the DB accepts any int, but zero/negatives make no sense.
    const errs: string[] = [];
    if (draft.per_km_petrol   <= 0) errs.push('Petrol rate must be > 0');
    if (draft.per_km_diesel   <= 0) errs.push('Diesel rate must be > 0');
    if (draft.per_km_hybrid   <= 0) errs.push('Hybrid rate must be > 0');
    if (draft.per_km_electric <= 0) errs.push('Electric rate must be > 0');
    if (draft.min_contribution <  0) errs.push('Minimum contribution must be ≥ 0');
    if (draft.adjust_band_pct  < 0 || draft.adjust_band_pct  > 50) errs.push('Adjust band % must be 0–50');
    if (draft.bus_discount_pct < 0 || draft.bus_discount_pct > 90) errs.push('Bus discount % must be 0–90');
    if (errs.length) { toast.push({ kind: 'error', message: errs[0] }); return; }
    try {
      setSaving(true);
      await adminUpdatePricingConfig(draft);
      toast.push({ kind: 'success', message: 'Pricing config saved.' });
      await refetch();
    } catch (e) {
      toast.push({ kind: 'error', message: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !draft) {
    return (
      <Card>
        <CardTitle>Pricing config</CardTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} heightClass="h-12" />)}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Pricing config</CardTitle>
          <CardDescription>
            Applies to every new suggestion the app makes. Existing posted journeys keep their fare.
          </CardDescription>
        </div>
        {dirty && (
          <span className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-warning/15 text-warning">
            unsaved
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <NumField label="Petrol · RWF / km"   value={draft.per_km_petrol}   onChange={(v) => setDraft({ ...draft, per_km_petrol: v })} suffix="RWF" />
        <NumField label="Diesel · RWF / km"   value={draft.per_km_diesel}   onChange={(v) => setDraft({ ...draft, per_km_diesel: v })} suffix="RWF" />
        <NumField label="Hybrid · RWF / km"   value={draft.per_km_hybrid}   onChange={(v) => setDraft({ ...draft, per_km_hybrid: v })} suffix="RWF" />
        <NumField label="Electric · RWF / km" value={draft.per_km_electric} onChange={(v) => setDraft({ ...draft, per_km_electric: v })} suffix="RWF" />
        <NumField label="Minimum contribution" value={draft.min_contribution} onChange={(v) => setDraft({ ...draft, min_contribution: v })} suffix="RWF" />
        <NumField label="Driver adjust band"   value={draft.adjust_band_pct}  onChange={(v) => setDraft({ ...draft, adjust_band_pct: v })}  suffix="%" hint="Max ± drivers may nudge the suggestion." />
        <NumField label="Bus discount"         value={draft.bus_discount_pct} onChange={(v) => setDraft({ ...draft, bus_discount_pct: v })} suffix="%" hint="Cap on corridors that have a bus fare ref." />
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => data && setDraft(data)} disabled={!dirty || saving}>
          Reset
        </Button>
        <Button onClick={onSave} loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}

function NumField({
  label, value, onChange, suffix, hint,
}: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-text-muted mb-1.5">{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full h-11 rounded-field bg-bg border border-border px-3 pr-14 text-sm text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-text-muted">{suffix}</span>
        )}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-text-subtle">{hint}</span>}
    </label>
  );
}

/* ─────────── Corridor fares ─────────── */

function CorridorFaresCard() {
  const toast = useToast();

  const faresFetcher = useCallback(() => adminListCorridorFares(), []);
  const onError = useCallback(
    (err: unknown) => toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Load failed.' }),
    [toast],
  );
  const { data: fares, loading: faresLoading, refetch } = useDataFetch<CorridorFareRow[]>(faresFetcher, [], { onError });
  const locsFetcher = useCallback(() => listLocations(), []);
  const { data: locations, loading: locsLoading } = useDataFetch<Location[]>(locsFetcher, [], { onError });
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (locations ?? []).forEach((l) => m.set(l.id, l.name));
    return m;
  }, [locations]);

  const [origin, setOrigin] = useState('');
  const [dest, setDest]     = useState('');
  const [fare, setFare]     = useState<string>('');
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);

  async function onAdd() {
    const fareN = Number(fare);
    if (!origin || !dest) { toast.push({ kind: 'error', message: 'Pick both origin and destination.' }); return; }
    if (origin === dest) { toast.push({ kind: 'error', message: 'Origin and destination must differ.' }); return; }
    if (!Number.isFinite(fareN) || fareN <= 0) { toast.push({ kind: 'error', message: 'Bus fare must be > 0.' }); return; }
    try {
      setSaving(true);
      await adminSetCorridorFare({ originId: origin, destinationId: dest, busFareRwf: fareN, notes: notes.trim() || null });
      invalidateCorridorFaresCache();
      toast.push({ kind: 'success', message: 'Corridor fare saved.' });
      setFare(''); setNotes('');
      await refetch();
    } catch (e) {
      toast.push({ kind: 'error', message: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this corridor fare?')) return;
    try {
      await adminDeleteCorridorFare(id);
      invalidateCorridorFaresCache();
      toast.push({ kind: 'success', message: 'Deleted.' });
      await refetch();
    } catch (e) {
      toast.push({ kind: 'error', message: e instanceof Error ? e.message : 'Delete failed.' });
    }
  }

  return (
    <Card>
      <CardTitle>Corridor bus-fare references</CardTitle>
      <CardDescription>
        When a corridor has a reference bus fare, the app caps the suggested contribution below it and shows
        “Cheaper than the bus” on matching journeys.
      </CardDescription>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
        <LocSelect label="Origin"      value={origin} onChange={setOrigin} locations={locations ?? []} loading={locsLoading} />
        <LocSelect label="Destination" value={dest}   onChange={setDest}   locations={locations ?? []} loading={locsLoading} />
        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1.5">Bus fare (RWF)</span>
          <input
            type="number" inputMode="numeric" value={fare}
            onChange={(e) => setFare(e.target.value)}
            className="w-full h-11 rounded-field bg-bg border border-border px-3 text-sm text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="e.g. 3500"
          />
        </label>
        <Button onClick={onAdd} loading={saving}>Save fare</Button>
      </div>
      <label className="block mt-3">
        <span className="block text-xs font-semibold text-text-muted mb-1.5">Notes (optional)</span>
        <input
          type="text" value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-11 rounded-field bg-bg border border-border px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
          placeholder="e.g. Kigali → Musanze via RN4"
        />
      </label>

      <div className="mt-6">
        <div className="text-xs font-semibold text-text-muted mb-2">Existing corridors</div>
        {faresLoading ? (
          <div className="space-y-2"><Skeleton heightClass="h-12" /><Skeleton heightClass="h-12" /></div>
        ) : (fares ?? []).length === 0 ? (
          <div className="rounded-field border border-border bg-bg p-4 text-sm text-text-muted">
            No corridor fares defined yet.
          </div>
        ) : (
          <div className="rounded-field border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg text-text-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Route</th>
                  <th className="text-right px-3 py-2 font-semibold">Bus fare</th>
                  <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Updated</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(fares ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 text-text">
                      {nameById.get(r.origin_location_id) ?? '—'} → {nameById.get(r.destination_location_id) ?? '—'}
                      {r.notes && <div className="text-xs text-text-muted truncate">{r.notes}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text">{r.bus_fare_rwf ? formatRWF(r.bus_fare_rwf) : '—'}</td>
                    <td className="px-3 py-2 text-text-muted hidden md:table-cell">{new Date(r.updated_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger hover:underline"
                        onClick={() => onDelete(r.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function LocSelect({
  label, value, onChange, locations, loading,
}: {
  label: string; value: string; onChange: (v: string) => void; locations: Location[]; loading: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-text-muted mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full h-11 rounded-field bg-bg border border-border px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
      >
        <option value="">{loading ? 'Loading…' : 'Select…'}</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}{l.district && l.district !== l.name ? ` — ${l.district}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

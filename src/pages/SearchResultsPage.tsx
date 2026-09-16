import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { TextField } from '@/components/ds/TextField';
import { Button } from '@/components/ds/Button';
import { DatePicker } from '@/components/ds/DatePicker';
import { Select } from '@/components/ds/Select';
import { Checkbox } from '@/components/ds/Checkbox';
import { Skeleton } from '@/components/ds/Skeleton';
import { CityAutocomplete } from '@/components/ds/CityAutocomplete';
import { JourneyCard } from '@/features/journeys/JourneyCard';
import {
  searchJourneys, type JourneyWithJoins, type SortMode, type EnergyType,
} from '@/features/journeys/api';
import { listLocations, type Location } from '@/features/locations/api';
import { useDataFetch } from '@/lib/useDataFetch';
import { useToast } from '@/components/ds/Toast';
import { RouteMapLazy } from '@/components/map/RouteMapLazy';
import type { ResultPin } from '@/components/map/RouteMap';

const TODAY = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

type TimeOfDay = 'any' | 'morning' | 'afternoon' | 'evening';
type ViewMode = 'list' | 'map';

export default function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();

  const view: ViewMode = params.get('view') === 'map' ? 'map' : 'list';

  const [allLocs, setAllLocs] = useState<Location[]>([]);
  useEffect(() => { void listLocations().then(setAllLocs).catch(() => {}); }, []);

  const initialFrom = useMemo(() => resolveLoc(allLocs, params.get('from')), [allLocs, params]);
  const initialTo   = useMemo(() => resolveLoc(allLocs, params.get('to')),   [allLocs, params]);
  const initialDate = useMemo(() => {
    const raw = params.get('date');
    if (!raw) return TODAY();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? TODAY() : d;
  }, [params]);
  const initialPax = useMemo(() => {
    const n = Number(params.get('pax') ?? '1');
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }, [params]);

  const [from, setFrom] = useState<Location | null>(null);
  const [to, setTo] = useState<Location | null>(null);
  const [date, setDate] = useState<Date | null>(initialDate);
  const [pax, setPax] = useState<string>(String(initialPax));

  useEffect(() => {
    if (allLocs.length === 0) return;
    if (!from && initialFrom) setFrom(initialFrom);
    if (!to && initialTo) setTo(initialTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLocs.length]);

  const [sort, setSort] = useState<SortMode>('earliest');
  const [energy, setEnergy] = useState<Record<EnergyType, boolean>>({ petrol: false, diesel: false, hybrid: false, electric: false });
  const [tod, setTod] = useState<TimeOfDay>('any');

  const paxNum = useMemo(() => Number(pax) || 1, [pax]);

  const activeEnergyTypes = useMemo(
    () => (Object.keys(energy) as EnergyType[]).filter((k) => energy[k]),
    [energy],
  );

  const fetcher = useCallback(async () => {
    return await searchJourneys(
      {
        fromLocationId: from?.id ?? null,
        toLocationId:   to?.id ?? null,
        date,
        passengers: paxNum,
        energyTypes: activeEnergyTypes.length > 0 ? activeEnergyTypes : undefined,
        timeOfDay: tod,
      },
      { sort },
    );
  }, [from?.id, to?.id, date, paxNum, activeEnergyTypes.join('|'), tod, sort]);

  const onError = useCallback((err: unknown) => {
    // Real DB/network failure only — empty-result cases don't come through
    // this path (they return an empty array, which the list view renders as
    // <EmptyState/>). Surface the actual message so it's actionable instead
    // of a mystery "Search failed" toast.
    const raw = err instanceof Error ? err.message : String(err ?? '');
    // eslint-disable-next-line no-console
    console.error('[search] request failed', err);
    const friendly =
      /network|fetch|failed to fetch/i.test(raw)
        ? "We couldn't reach the network. Check your connection and try again."
        : `Couldn't load rides: ${raw || 'unknown error'}`;
    toast.push({ kind: 'error', message: friendly });
  }, [toast]);

  const { data, loading, refetch } = useDataFetch<JourneyWithJoins[]>(
    fetcher,
    [from?.id, to?.id, date?.toDateString(), paxNum, activeEnergyTypes.join('|'), tod, sort],
    { onError },
  );
  const rows = data ?? [];

  // Build map inputs.
  const origin = from && from.lat != null && from.lng != null ? { lat: from.lat, lng: from.lng, label: from.name } : null;
  const destination = to && to.lat != null && to.lng != null ? { lat: to.lat, lng: to.lng, label: to.name } : null;

  // Result pins jitter around the origin so each ride has its own dot without
  // requiring a full geocoded pickup point (we don't collect one yet).
  const resultPins: ResultPin[] = useMemo(() => {
    if (!from || from.lat == null || from.lng == null) return [];
    return rows.map((j) => ({
      id: j.id,
      lat: from.lat as number,
      lng: from.lng as number,
      label: `${j.driver?.full_name ?? 'Driver'}`,
      sublabel: new Date(j.departure_time).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
    }));
  }, [rows, from]);

  function commitBar() {
    const next = new URLSearchParams(params);
    if (from) next.set('from', from.id); else next.delete('from');
    if (to) next.set('to', to.id); else next.delete('to');
    if (date) next.set('date', date.toISOString().slice(0, 10)); else next.delete('date');
    if (paxNum !== 1) next.set('pax', String(paxNum)); else next.delete('pax');
    setParams(next, { replace: true });
    void refetch();
  }

  function setView(v: ViewMode) {
    const next = new URLSearchParams(params);
    if (v === 'map') next.set('view', 'map'); else next.delete('view');
    setParams(next, { replace: true });
  }

  function goHomeSearch() { nav('/'); }

  return (
    <div className={view === 'map' ? 'bg-bg' : 'bg-bg'}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {/* Editable summary bar */}
        <Card className="!p-3 sm:!p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); commitBar(); }}
            className="grid gap-3 sm:grid-cols-[1.6fr_1.6fr_0.9fr_auto_auto] sm:items-end"
          >
            <CityAutocomplete label="From" value={from} onChange={setFrom} />
            <CityAutocomplete label="To" value={to} onChange={setTo} />
            <DatePicker label="Date" value={date} onChange={setDate} disablePast />
            <TextField label="Passengers" type="number" inputMode="numeric" min={1} max={7}
              value={pax} onChange={(e) => setPax(e.target.value)} className="sm:w-24" />
            <Button type="submit" size="md" className="sm:h-12">Update</Button>
          </form>
        </Card>

        {/* View toggle + counter */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-text-muted min-w-0 truncate">
            {loading ? 'Loading…' : `${rows.length} ride${rows.length === 1 ? '' : 's'}`}
            {from && to && !loading && <> · {from.name} → {to.name}</>}
          </div>
          <div className="flex items-center gap-1 rounded-pill border border-border bg-bg-elevated p-1 shrink-0">
            <ViewChip active={view === 'list'} onClick={() => setView('list')} icon={<ListIcon />} label="List" />
            <ViewChip active={view === 'map'}  onClick={() => setView('map')}  icon={<MapIcon />}  label="Map" />
          </div>
          <button type="button" onClick={goHomeSearch} className="hidden sm:inline text-xs text-brand font-semibold">
            New search
          </button>
        </div>

        {view === 'map' ? (
          <MapView
            origin={origin}
            destination={destination}
            resultPins={resultPins}
            rows={rows}
            loading={loading}
            from={from}
            to={to}
            onPinClick={(id) => nav(`/journeys/${id}`)}
          />
        ) : (
          <ListView
            rows={rows}
            loading={loading}
            from={from}
            to={to}
            origin={origin}
            destination={destination}
            sort={sort} setSort={setSort}
            energy={energy} setEnergy={setEnergy}
            tod={tod} setTod={setTod}
          />
        )}
      </div>
    </div>
  );
}

/* ─── LIST VIEW ─────────────────────────────────────────────────────────── */

function ListView({
  rows, loading, from, to, origin, destination,
  sort, setSort, energy, setEnergy, tod, setTod,
}: {
  rows: JourneyWithJoins[]; loading: boolean;
  from: Location | null; to: Location | null;
  origin: { lat: number; lng: number; label?: string } | null;
  destination: { lat: number; lng: number; label?: string } | null;
  sort: SortMode; setSort: (v: SortMode) => void;
  energy: Record<EnergyType, boolean>;
  setEnergy: (u: (p: Record<EnergyType, boolean>) => Record<EnergyType, boolean>) => void;
  tod: TimeOfDay; setTod: (v: TimeOfDay) => void;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-[300px_1fr]">
      <section aria-live="polite" className="space-y-3 md:col-start-2 md:row-start-1 min-w-0 order-1 md:order-none">
        {loading ? (
          <div className="grid gap-3">
            <ResultSkeleton /><ResultSkeleton /><ResultSkeleton />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3">
            {rows.map((j) => <JourneyCard key={j.id} j={j} />)}
          </div>
        )}
      </section>

      <aside className="space-y-4 md:col-start-1 md:row-start-1 order-2 md:order-none">
        <Card>
          <CardTitle>Sort</CardTitle>
          <div className="mt-3">
            <Select<SortMode>
              label="Order by" value={sort} onChange={setSort}
              options={[
                { value: 'earliest', label: 'Earliest departure' },
                { value: 'cheapest', label: 'Lowest contribution' },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardTitle>Vehicle</CardTitle>
          <div className="mt-3 grid gap-2">
            {(['petrol','diesel','hybrid','electric'] as EnergyType[]).map((k) => (
              <Checkbox
                key={k} checked={energy[k]}
                onChange={(v) => setEnergy((prev) => ({ ...prev, [k]: v }))}
                label={k === 'electric' ? 'Electric ⚡' : k.charAt(0).toUpperCase() + k.slice(1)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Time of day</CardTitle>
          <div className="mt-3">
            <Select<TimeOfDay>
              label="Departing" value={tod} onChange={setTod}
              options={[
                { value: 'any',       label: 'Any time' },
                { value: 'morning',   label: 'Morning (4:00 – 12:00)' },
                { value: 'afternoon', label: 'Afternoon (12:00 – 17:00)' },
                { value: 'evening',   label: 'Evening (17:00 – 4:00)' },
              ]}
            />
          </div>
        </Card>

        <Card className="!p-0 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-text">Route</span>
            {from && to && (
              <span className="text-xs text-text-muted truncate hidden sm:inline">{from.name} → {to.name}</span>
            )}
          </div>
          <div className="h-64 sm:h-80 px-3 pb-3">
            <RouteMapLazy
              origin={origin}
              destination={destination}
              className="h-full w-full"
              ariaLabel={from && to ? `Route from ${from.name} to ${to.name}` : 'Route map'}
            />
          </div>
        </Card>
      </aside>
    </div>
  );
}

/* ─── MAP VIEW (large BlaBlaCar-style) ──────────────────────────────────── */

function MapView({
  origin, destination, resultPins, rows, loading, from, to, onPinClick,
}: {
  origin: { lat: number; lng: number; label?: string } | null;
  destination: { lat: number; lng: number; label?: string } | null;
  resultPins: ResultPin[];
  rows: JourneyWithJoins[]; loading: boolean;
  from: Location | null; to: Location | null;
  onPinClick: (id: string) => void;
}) {
  const [mobileListOpen, setMobileListOpen] = useState(false);
  return (
    <div className="relative">
      {/* Desktop: split panel (map dominant + narrow list). Mobile: full-screen map with a drawer for the list. */}
      <div className="grid gap-4 md:grid-cols-[360px_1fr]">
        {/* List column — hidden on mobile except via drawer */}
        <section className="hidden md:block space-y-3 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
          {loading ? (
            <div className="grid gap-3">
              <ResultSkeleton /><ResultSkeleton /><ResultSkeleton />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-3">
              {rows.map((j) => <JourneyCard key={j.id} j={j} />)}
            </div>
          )}
        </section>

        {/* Big map */}
        <div className="rounded-card overflow-hidden border border-border bg-bg-elevated">
          <div className="h-[70vh] md:h-[calc(100vh-14rem)] min-h-[420px] w-full">
            <RouteMapLazy
              origin={origin}
              destination={destination}
              resultPins={resultPins}
              onPinClick={onPinClick}
              className="h-full w-full !rounded-none !border-0"
              ariaLabel={from && to ? `Map of rides from ${from.name} to ${to.name}` : 'Ride map'}
            />
          </div>
        </div>
      </div>

      {/* Mobile: floating "See X rides" button opens the list drawer */}
      <button
        type="button"
        onClick={() => setMobileListOpen(true)}
        className="md:hidden fixed left-1/2 -translate-x-1/2 bottom-20 z-30 inline-flex items-center gap-2 h-11 px-5 rounded-pill bg-navy text-white shadow-elevate font-semibold"
      >
        <ListIcon /> See {rows.length} ride{rows.length === 1 ? '' : 's'}
      </button>

      {mobileListOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileListOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute left-0 right-0 bottom-0 max-h-[80vh] bg-surface rounded-t-card border-t border-border shadow-elevate overflow-y-auto"
            style={{ backgroundColor: 'rgb(var(--surface))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'rgb(var(--surface))' }}>
              <span className="text-sm font-bold text-text">
                {loading ? 'Loading…' : `${rows.length} ride${rows.length === 1 ? '' : 's'}`}
              </span>
              <button
                type="button"
                onClick={() => setMobileListOpen(false)}
                className="text-brand font-semibold text-sm"
              >
                Close
              </button>
            </div>
            <div className="p-3 grid gap-3">
              {loading ? (
                <><ResultSkeleton /><ResultSkeleton /></>
              ) : rows.length === 0 ? (
                <EmptyState />
              ) : (
                rows.map((j) => <JourneyCard key={j.id} j={j} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Bits ──────────────────────────────────────────────────────────────── */

function ViewChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-xs font-semibold transition-colors',
        active ? 'bg-navy text-white' : 'text-text-muted hover:text-text',
      ].join(' ')}
      aria-pressed={active}
    >
      {icon}{label}
    </button>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EmptyState() {
  return (
    <Card>
      <div className="flex flex-col items-center text-center py-6">
        <EmptyIcon />
        <CardTitle>No rides on this route yet</CardTitle>
        <CardDescription>Try another day, or check nearby towns. New trips are added every day.</CardDescription>
        <div className="mt-4">
          <Link to="/"><Button variant="outline" size="sm">Change route</Button></Link>
        </div>
      </div>
    </Card>
  );
}

function ResultSkeleton() {
  return (
    <Card>
      <div className="flex flex-col sm:flex-row gap-4 sm:items-start justify-between">
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton widthClass="w-32" heightClass="h-3.5" />
          <Skeleton widthClass="w-3/5" heightClass="h-5" />
          <Skeleton widthClass="w-4/5" heightClass="h-3" />
        </div>
        <div className="w-32 space-y-2">
          <Skeleton widthClass="w-20" heightClass="h-5" />
          <Skeleton widthClass="w-24" heightClass="h-9" />
        </div>
      </div>
    </Card>
  );
}

function EmptyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="42" height="42" fill="none" aria-hidden className="text-text-muted mb-2">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 15c1-2 2.5-3 4-3s3 1 4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

/** Accepts a UUID or "name:<Name>" prefix from URL params. Returns null if not found. */
function resolveLoc(all: Location[], raw: string | null): Location | null {
  if (!raw || all.length === 0) return null;
  if (raw.startsWith('name:')) {
    const n = raw.slice('name:'.length).toLowerCase();
    return all.find((l) => l.name.toLowerCase() === n) ?? null;
  }
  return all.find((l) => l.id === raw) ?? null;
}

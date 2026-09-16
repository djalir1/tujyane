import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Loader } from '@/components/ds/Loader';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import { AuthPromptGate } from '@/auth/AuthPromptGate';
import { getJourney, type JourneyWithJoins } from '@/features/journeys/api';
import { getExistingBooking, requestRide, type BookingRow } from '@/features/bookings/api';
import { findCorridorFare, listCorridorFares, listLocations, type CorridorFare, type Location } from '@/features/locations/api';
import { formatDateTime, formatRWF, pluralSeats } from '@/lib/format';
import { useDataFetch } from '@/lib/useDataFetch';
import { RouteMapLazy } from '@/components/map/RouteMapLazy';

type Loaded = {
  journey: JourneyWithJoins | null;
  booking: BookingRow | null;
  origin: Location | null;
  destination: Location | null;
  busFare: number | null;
};

export default function JourneyDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { user, status } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);

  // Loads journey + (if signed in) the current viewer's existing booking on it.
  // We depend on `user?.id`, not the full `user` object — that reference flips
  // during AuthProvider hydration and would otherwise re-trigger this fetch on
  // every render, whipping the page back to the full-screen loader.
  const fetcher = useCallback(async (): Promise<Loaded> => {
    const journey = await getJourney(id);
    if (!journey) return { journey: null, booking: null, origin: null, destination: null, busFare: null };
    const [booking, locs, fares] = await Promise.all([
      user ? getExistingBooking(journey.id, user.id) : Promise.resolve<BookingRow | null>(null),
      listLocations().catch(() => [] as Location[]),
      listCorridorFares().catch(() => [] as CorridorFare[]),
    ]);
    const origin = journey.origin_location_id
      ? locs.find((l) => l.id === journey.origin_location_id) ?? null
      : null;
    const destination = journey.destination_location_id
      ? locs.find((l) => l.id === journey.destination_location_id) ?? null
      : null;
    const busFare = findCorridorFare(fares, journey.origin_location_id, journey.destination_location_id);
    return { journey, booking, origin, destination, busFare };
  }, [id, user]);

  const onError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not load the journey.';
      toast.push({ kind: 'error', message: msg });
    },
    [toast],
  );

  const { data, loading, refetch } = useDataFetch<Loaded>(
    fetcher,
    [id, user?.id],
    { enabled: Boolean(id), onError },
  );

  const j = data?.journey ?? null;
  const existing = data?.booking ?? null;
  const origin = data?.origin ?? null;
  const destination = data?.destination ?? null;
  const busFare = data?.busFare ?? null;

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] grid place-items-center p-6">
        <Loader size="lg" label="Loading journey…" />
      </div>
    );
  }

  if (!j) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardTitle>Journey not found</CardTitle>
          <CardDescription>It may have been removed, or the link is wrong.</CardDescription>
        </Card>
      </div>
    );
  }

  const isDriver = user && user.id === j.driver_id;
  const dt = formatDateTime(j.departure_time);
  const ev = j.vehicle?.energy_type === 'electric';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-4">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
          <div className="min-w-0">
            <div className="t-caption">{dt.full}</div>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex flex-col items-center pt-1 shrink-0">
                <span className="w-3 h-3 rounded-full bg-brand" />
                <span className="w-px flex-1 bg-border my-1 min-h-6" />
                <span className="w-3 h-3 rounded-full border-2 border-brand" />
              </div>
              <div className="min-w-0">
                <div className="t-h2 text-text truncate">{j.origin_text}</div>
                <div className="t-h2 text-text truncate">{j.destination_text}</div>
              </div>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-2xl font-bold text-text tabular-nums">{formatRWF((j.contribution_per_seat ?? j.suggested_contribution))}</div>
            <div className="text-xs text-text-muted">per seat · {pluralSeats(j.seats_available)} left</div>
            {busFare != null && busFare > (j.contribution_per_seat ?? j.suggested_contribution) && (
              <div
                className="mt-2 inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand"
                title={`Bus reference for this corridor: ${formatRWF(busFare)}`}
              >
                Cheaper than the bus · save ~{Math.round(((busFare - (j.contribution_per_seat ?? j.suggested_contribution)) / busFare) * 100)}%
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Driver</CardTitle>
          <div className="mt-4 flex items-center gap-3">
            <Avatar name={j.driver?.full_name ?? 'Driver'} url={j.driver?.avatar_url ?? null} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text truncate">
                {j.driver?.full_name ?? 'Driver'}
                {j.driver?.is_verified_driver && (
                  <span className="ml-1 inline-flex items-center gap-1 text-xs text-brand">
                    <VerifiedDot /> verified
                  </span>
                )}
              </div>
              <div className="text-xs text-text-muted">
                ★ {j.driver?.rating_count ? j.driver.rating_avg.toFixed(1) : '—'}
                {j.driver?.rating_count ? ` (${j.driver.rating_count} ratings)` : ' (no ratings yet)'}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Vehicle</CardTitle>
          <div className="mt-4 text-sm text-text">
            {j.vehicle ? (
              <>
                <div className="font-semibold">
                  {j.vehicle.make} {j.vehicle.model}
                  {j.vehicle.year ? ` · ${j.vehicle.year}` : ''}
                </div>
                <div className="text-xs text-text-muted mt-1 flex items-center gap-2">
                  <span className="capitalize">{j.vehicle.energy_type}</span>
                  {ev && <span title="Electric">⚡</span>}
                  {!j.vehicle.is_verified && (
                    <span className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-warning/15 text-warning">
                      Pending verification
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-text-muted">Not linked to a vehicle.</div>
            )}
          </div>
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between gap-2">
          <CardTitle>Route map</CardTitle>
          {j.distance_km != null && (
            <span className="text-xs text-text-muted">{j.distance_km.toFixed(0)} km</span>
          )}
        </div>
        <div className="h-56 sm:h-72 px-3 sm:px-4 pb-3 sm:pb-4">
          <RouteMapLazy
            origin={origin && origin.lat != null && origin.lng != null ? { lat: origin.lat, lng: origin.lng, label: origin.name } : null}
            destination={destination && destination.lat != null && destination.lng != null ? { lat: destination.lat, lng: destination.lng, label: destination.name } : null}
            className="h-full w-full"
            ariaLabel={`Route from ${j.origin_text} to ${j.destination_text}`}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Preferences</CardTitle>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrefChip on={j.luggage_allowed}   label="Luggage" icon={<LuggageIcon />} />
          <PrefChip on={j.pets_allowed}      label="Pets"    icon={<PawIcon />} />
          <PrefChip on={j.smoking_allowed}   label="Smoking" icon={<SmokeIcon />} />
        </div>
        {j.notes && (
          <div className="mt-4 rounded-field bg-bg-elevated border border-border p-4 text-sm text-text whitespace-pre-wrap">
            {j.notes}
          </div>
        )}
      </Card>

      {/* Action zone */}
      {isDriver ? (
        <Card>
          <CardTitle>Your journey</CardTitle>
          <CardDescription>Manage requests from the driver dashboard.</CardDescription>
        </Card>
      ) : status === 'authenticated' ? (
        <Card>
          <CardTitle>Ready to go?</CardTitle>
          <CardDescription>
            {existing && !['cancelled','rejected','no_show','completed'].includes(existing.status)
              ? `You already have a booking on this journey (status: ${existing.status}).`
              : 'Send a request to the driver. They will confirm your seat.'}
          </CardDescription>
          <div className="mt-4">
            <Button
              onClick={() => setDialogOpen(true)}
              disabled={
                j.seats_available < 1
                || Boolean(existing && !['cancelled','rejected','no_show','completed'].includes(existing.status))
              }
            >
              {j.seats_available < 1 ? 'Journey full' : 'Request ride'}
            </Button>
          </div>
        </Card>
      ) : (
        <AuthPromptGate
          title="Create an account to request this ride"
          description="Browsing is free. Sign in when you're ready to book."
        >
          <></>
        </AuthPromptGate>
      )}

      {dialogOpen && j && (
        <RequestRideDialog
          journey={j}
          onClose={() => setDialogOpen(false)}
          onDone={() => {
            setDialogOpen(false);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function RequestRideDialog({
  journey, onClose, onDone,
}: { journey: JourneyWithJoins; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const max = Math.min(journey.seats_available, 4);
  const [seats, setSeats] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => (journey.contribution_per_seat ?? journey.suggested_contribution) * seats, [(journey.contribution_per_seat ?? journey.suggested_contribution), seats]);

  async function confirm() {
    if (!user) return;
    try {
      setBusy(true);
      await requestRide({
        journeyId: journey.id,
        passengerId: user.id,
        seats,
        contributionAmount: total,
      });
      toast.push({ kind: 'success', title: 'Request sent', message: 'The driver will confirm your seat.' });
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send the request.';
      toast.push({ kind: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Request ride"
           className="relative w-full max-w-md rounded-card bg-bg-elevated border border-border shadow-elevate p-6">
        <h2 className="t-h2 text-text">Request this ride</h2>
        <p className="text-sm text-text-muted mt-1">
          {journey.origin_text} → {journey.destination_text}
        </p>

        <div className="mt-5">
          <div className="text-sm font-medium text-text mb-2">Seats</div>
          <div className="inline-flex items-center gap-1 rounded-field border border-border bg-surface">
            <button
              type="button"
              className="h-11 w-11 rounded-l-field grid place-items-center text-text hover:bg-surface-hover disabled:opacity-40"
              onClick={() => setSeats((s) => Math.max(1, s - 1))}
              disabled={seats <= 1}
              aria-label="Decrease seats"
            >−</button>
            <span className="min-w-10 text-center font-semibold text-text tabular-nums">{seats}</span>
            <button
              type="button"
              className="h-11 w-11 rounded-r-field grid place-items-center text-text hover:bg-surface-hover disabled:opacity-40"
              onClick={() => setSeats((s) => Math.min(max, s + 1))}
              disabled={seats >= max}
              aria-label="Increase seats"
            >+</button>
          </div>
          <div className="text-xs text-text-muted mt-1">{pluralSeats(journey.seats_available)} available.</div>
        </div>

        <div className="mt-5 rounded-field bg-surface border border-border p-4 flex items-center justify-between">
          <div className="text-sm text-text-muted">Total contribution</div>
          <div className="text-lg font-bold text-text tabular-nums">{formatRWF(total)}</div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} loading={busy}>Send request</Button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  if (url) return <img src={url} alt="" className="h-12 w-12 rounded-full object-cover border border-border" />;
  return (
    <span className="h-12 w-12 rounded-full grid place-items-center bg-navy text-white font-semibold shrink-0" aria-hidden>
      {initials || '?'}
    </span>
  );
}

function PrefChip({
  on, label, icon, highlightWhenOn,
}: { on: boolean; label: string; icon: React.ReactNode; highlightWhenOn?: boolean }) {
  const active = highlightWhenOn ? on : true;
  const tone = on
    ? active
      ? 'bg-brand/12 text-brand border-brand/30'
      : 'bg-surface-hover text-text border-border'
    : 'bg-surface-hover text-text-subtle border-border line-through';
  return (
    <span className={['inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-xs font-semibold border', tone].join(' ')}>
      <span aria-hidden>{icon}</span>{label}
    </span>
  );
}

function VerifiedDot() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="10" opacity="0.2" /><path d="M8 12.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function LuggageIcon() { return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden><rect x="4" y="7" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M9 7V5h6v2" stroke="currentColor" strokeWidth="1.6"/></svg>; }
function PawIcon()     { return <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden><circle cx="7" cy="9" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="17" cy="9" r="1.6"/><circle cx="19" cy="14" r="1.6"/><circle cx="5" cy="14" r="1.6"/><path d="M12 12c-3 0-5 2-5 4.5S9 20 12 20s5-1 5-3.5S15 12 12 12z"/></svg>; }
function SmokeIcon()   { return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden><rect x="3" y="15" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.6"/><path d="M19 6c2 2-1 3 1 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }

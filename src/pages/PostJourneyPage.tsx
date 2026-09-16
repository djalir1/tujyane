import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { TextField } from '@/components/ds/TextField';
import { Select } from '@/components/ds/Select';
import { Button } from '@/components/ds/Button';
import { DatePicker } from '@/components/ds/DatePicker';
import { TimePicker } from '@/components/ds/TimePicker';
import { Toggle } from '@/components/ds/Toggle';
import { Skeleton } from '@/components/ds/Skeleton';
import { CityAutocomplete } from '@/components/ds/CityAutocomplete';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import { listMyVehicles, type Vehicle } from '@/features/vehicles/api';
import { AddVehicleForm } from '@/features/vehicles/AddVehicleForm';
import { createJourney, type Recurrence } from '@/features/journeys/api';
import {
  findCorridorFare, listCorridorFares, listLocations, loadPricingConfig,
  type CorridorFare, type Location, locationLabel,
} from '@/features/locations/api';
import { computeSuggested, type PricingBreakdown, type PricingConfig, withinBand, breakdownLine } from '@/lib/pricing';
import { useDataFetch } from '@/lib/useDataFetch';
import { formatRWF } from '@/lib/format';
import { afterErrorsRender } from '@/lib/formErrors';
import { validateDepartureTime, validateSeats } from '@/lib/validation';

type Errors = Partial<Record<
  | 'origin' | 'destination'
  | 'date' | 'time'
  | 'vehicle' | 'seats'
  | 'contribution'
  | 'form',
  string
>>;

type Bundle = { vehicles: Vehicle[]; config: PricingConfig; fares: CorridorFare[] };

export default function PostJourneyPage() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  // Recurrence prefill: OverviewPage's "Post next" link comes in with the
  // route/vehicle/price/departure query params. JourneyForm consumes them
  // once on mount so the driver just clicks Post.
  const [urlParams] = useSearchParams();
  const prefill = {
    fromId: urlParams.get('from_id') || null,
    toId:   urlParams.get('to_id') || null,
    vehicleId: urlParams.get('vehicle_id') || null,
    seats: urlParams.get('seats') || null,
    contribution: urlParams.get('contribution') || null,
    departureIso: urlParams.get('departure') || null,
    recurrence: urlParams.get('recurrence') || null,
  };

  const fetcher = useCallback(async (): Promise<Bundle> => {
    if (!user) return { vehicles: [], config: FALLBACK_CONFIG, fares: [] };
    const [vehicles, config, fares] = await Promise.all([
      listMyVehicles(user.id),
      loadPricingConfig(),
      listCorridorFares().catch(() => [] as CorridorFare[]),
    ]);
    return { vehicles, config, fares };
  }, [user]);

  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load the form.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading, refetch } = useDataFetch<Bundle>(fetcher, [user?.id], { enabled: Boolean(user), onError });
  const vehicles = data?.vehicles ?? [];
  const config = data?.config ?? FALLBACK_CONFIG;
  const fares = data?.fares ?? [];

  const [addingOverride, setAddingOverride] = useState(false);

  if (loading || !user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <VehicleOrFormSkeleton />
      </div>
    );
  }

  // Verification gate — must match the DB reality exactly. Two independent
  // gates on the server (migration 0016 + 0021):
  //   1. profile.is_verified_driver — from personal docs (national_id +
  //      driving_license both approved).
  //   2. at least one vehicles.is_verified — from vehicle_registration +
  //      car_photo both approved for the SAME vehicle.
  // Missing either → DB refuses INSERT. The message must name exactly which
  // side is blocking so the driver isn't left staring at "verified ✓" on
  // one page and "not verified" on another.
  const personalVerified = Boolean(profile?.is_verified_driver);
  const anyVehicleVerified = vehicles.some((v) => v.is_verified);
  const hasAnyVehicle = vehicles.length > 0;

  if (!personalVerified || !anyVehicleVerified) {
    let title = 'Get verified first';
    let description =
      'You need approved personal documents AND at least one approved car before posting a journey. Usually under 24 hours.';
    if (personalVerified && !hasAnyVehicle) {
      title = 'Add a car to post a journey';
      description = 'Your personal verification is approved. Add a vehicle, then upload its registration and a car photo — approving those verifies the car and unlocks posting.';
    } else if (personalVerified && hasAnyVehicle && !anyVehicleVerified) {
      title = 'Your car is pending verification';
      description = 'Your personal verification is approved, but none of your cars are approved yet. Upload the vehicle registration and a clear car photo on the verification page, pick which car they belong to, then click "Send for verification". Approval unlocks posting on that car.';
    } else if (!personalVerified) {
      title = 'Personal verification is pending';
      description = 'Upload your National ID and Driving license on the verification page. Once approved, you can add a car and post journeys.';
    }
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Card className="!bg-warning/10 !border-warning/30">
          <div className="t-caption">Driver</div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Button onClick={() => nav('/dashboard/verification')}>Open verification page</Button>
            <Button variant="outline" onClick={() => nav('/dashboard')}>Back to overview</Button>
          </div>
          {hasAnyVehicle && (
            <div className="mt-4 border-t border-warning/30 pt-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Your cars</div>
              <ul className="mt-2 space-y-1">
                {vehicles.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-text truncate">{v.make} {v.model} · {v.plate_number}</span>
                    <span className={v.is_verified ? 'text-brand font-semibold' : 'text-warning font-semibold'}>
                      {v.is_verified ? 'Approved' : 'Pending verification'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const showAdd = addingOverride || vehicles.length === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {showAdd ? (
        <AddVehicleForm
          onCreated={async () => { setAddingOverride(false); await refetch(); }}
          onCancel={vehicles.length > 0 ? () => setAddingOverride(false) : undefined}
        />
      ) : (
        <JourneyForm
          vehicles={vehicles}
          config={config}
          fares={fares}
          prefill={prefill}
          onAddAnother={() => setAddingOverride(true)}
          onCreated={() => {
            toast.push({ kind: 'success', title: 'Journey posted', message: 'Passengers can now find and request it.' });
            nav('/dashboard/journeys');
          }}
        />
      )}
    </div>
  );
}

const FALLBACK_CONFIG: PricingConfig = {
  per_km_petrol: 120, per_km_diesel: 100, per_km_hybrid: 80, per_km_electric: 55,
  min_contribution: 500, adjust_band_pct: 10, bus_discount_pct: 20,
};

type Prefill = {
  fromId: string | null;
  toId: string | null;
  vehicleId: string | null;
  seats: string | null;
  contribution: string | null;
  departureIso: string | null;
  recurrence: string | null;
};

function JourneyForm({
  vehicles, config, fares, prefill, onAddAnother, onCreated,
}: {
  vehicles: Vehicle[];
  config: PricingConfig;
  fares: CorridorFare[];
  prefill?: Prefill;
  onAddAnother: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();

  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [date, setDate] = useState<Date | null>(() => {
    if (!prefill?.departureIso) return null;
    const d = new Date(prefill.departureIso);
    return Number.isNaN(d.getTime()) ? null : d;
  });
  const [time, setTime] = useState<string | null>(() => {
    if (!prefill?.departureIso) return null;
    const d = new Date(prefill.departureIso);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const [recurrence, setRecurrence] = useState<Recurrence>(() =>
    (prefill?.recurrence as Recurrence) || 'once',
  );
  // Default to the driver's FIRST VERIFIED vehicle unless prefill picks one.
  const firstVerified = vehicles.find((v) => v.is_verified);
  const [vehicleId, setVehicleId] = useState<string | undefined>(
    prefill?.vehicleId && vehicles.find((v) => v.id === prefill.vehicleId && v.is_verified)
      ? prefill.vehicleId
      : firstVerified?.id,
  );
  const [seats, setSeats] = useState<string>(
    prefill?.seats ?? String(Math.min(4, firstVerified?.seats ?? 4)),
  );
  const [contribution, setContribution] = useState<string>(prefill?.contribution ?? '');
  const [contributionDirty, setContributionDirty] = useState(Boolean(prefill?.contribution));

  // Resolve prefill.fromId / prefill.toId to actual Location rows once.
  useEffect(() => {
    if (!prefill?.fromId && !prefill?.toId) return;
    let alive = true;
    void listLocations().then((rows) => {
      if (!alive) return;
      if (prefill.fromId) {
        const o = rows.find((r) => r.id === prefill.fromId);
        if (o) setOrigin((cur) => cur ?? o);
      }
      if (prefill.toId) {
        const d = rows.find((r) => r.id === prefill.toId);
        if (d) setDestination((cur) => cur ?? d);
      }
    }).catch(() => { /* silent — user can still fill manually */ });
    return () => { alive = false; };
    // Prefill is a one-time seed; deps intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [luggage, setLuggage] = useState(true);
  const [pets, setPets] = useState(false);
  const [smoking, setSmoking] = useState(false);
  // women_only removed from the pilot product surface — column left in place
  // in the DB. Always write false so old rows/UI never toggle it on.
  const womenOnly = false;
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );
  const seatsNum = Number(seats) || 0;

  // Pricing breakdown recomputes when inputs change. Looks up any known bus
  // fare for this corridor so the suggestion is capped below it (see
  // src/lib/pricing.ts). Directionless: either A→B or B→A hits the same row.
  const breakdown: PricingBreakdown | null = useMemo(() => {
    if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) return null;
    if (!vehicle || seatsNum < 1) return null;
    const busFare = findCorridorFare(fares, origin.id, destination.id);
    return computeSuggested({
      cfg: config,
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      energy: vehicle.energy_type,
      seatsTotal: seatsNum,
      busFare,
    });
  }, [config, origin, destination, vehicle, seatsNum, fares]);

  // When breakdown lands and the user hasn't touched the contribution field yet,
  // set it to the suggested value.
  useMemo(() => {
    if (breakdown && !contributionDirty) {
      setContribution(String(breakdown.suggested));
    }
  }, [breakdown, contributionDirty]);

  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const next: Errors = {};
    if (!origin)      next.origin = 'Pick where you start.';
    if (!destination) next.destination = 'Pick where you’re going.';
    if (!date)        next.date = 'Pick a date.';
    if (!time)        next.time = 'Pick a time.';
    if (!vehicleId)   next.vehicle = 'Select a vehicle.';

    // Central seats validator — same rule DB enforces (guard_journey_seats_capacity).
    const seatsCheck = validateSeats(seatsNum, vehicle?.seats);
    if (!seatsCheck.ok) next.seats = seatsCheck.message;

    if (!breakdown) {
      next.contribution = 'Distance couldn’t be calculated — try different places.';
    } else {
      const chosen = Number(contribution);
      if (!Number.isFinite(chosen) || chosen < 0) {
        next.contribution = 'Contribution must be a non-negative number.';
      } else if (!withinBand(breakdown, Math.round(chosen))) {
        next.contribution = `Must be between ${formatRWF(breakdown.low)} and ${formatRWF(breakdown.high)}.`;
      }
    }

    let departureIso: string | null = null;
    if (date && time) {
      const [h, m] = time.split(':').map(Number);
      const d = new Date(date);
      d.setHours(h, m, 0, 0);
      // Central departure validator — matches DB guard_journey_departure_future.
      const depCheck = validateDepartureTime(d);
      if (!depCheck.ok) next.time = depCheck.message;
      else departureIso = d.toISOString();
    }

    setErrors(next);
    if (Object.keys(next).length || !departureIso || !vehicleId || !origin || !destination || !breakdown) {
      // Global form UX: scroll to the first invalid field, focus it, and
      // fire a summary toast so the user isn't left guessing.
      afterErrorsRender(formRef.current, (n) => {
        if (n > 0) toast.push({ kind: 'error', message: 'Please fix the highlighted fields.' });
      });
      return;
    }

    try {
      setSubmitting(true);
      await createJourney(user.id, {
        vehicle_id: vehicleId,
        origin_location_id:      origin.id,
        destination_location_id: destination.id,
        origin_text:             locationLabel(origin),
        destination_text:        locationLabel(destination),
        distance_km:             Math.round(breakdown.distanceKm * 10) / 10,
        departure_time: departureIso,
        recurrence,
        seats: seatsNum,
        suggested_contribution: breakdown.suggested,
        contribution_per_seat:  Math.round(Number(contribution)),
        luggage_allowed: luggage,
        pets_allowed: pets,
        smoking_allowed: smoking,
        women_only: womenOnly,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not post the journey.';
      setErrors({ form: msg });
      toast.push({ kind: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  // Only verified vehicles are pickable. Unverified ones would be refused by
  // the DB gate (guard_journey_insert_verified), so we hide them here rather
  // than let the driver submit and hit a wall.
  const verifiedVehicles = vehicles.filter((v) => v.is_verified);
  const vehicleOptions = verifiedVehicles.map((v) => ({
    value: v.id,
    label: `${v.make} ${v.model}${v.year ? ` · ${v.year}` : ''}`,
    description: `${v.seats} seats · ${v.energy_type}`,
  }));

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4">
      <Card>
        <CardTitle>Route</CardTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <CityAutocomplete
            label="From"
            value={origin}
            onChange={(v) => { setOrigin(v); setContributionDirty(false); }}
            placeholder="Kigali, Musanze, Rubavu…"
            error={errors.origin}
          />
          <CityAutocomplete
            label="To"
            value={destination}
            onChange={(v) => { setDestination(v); setContributionDirty(false); }}
            placeholder="Musanze, Huye, Gisenyi…"
            error={errors.destination}
          />
          <DatePicker label="Departure date" value={date} onChange={setDate} error={errors.date} />
          <TimePicker label="Departure time" value={time} onChange={setTime} error={errors.time} />
          <Select<Recurrence>
            label="Repeat"
            value={recurrence}
            onChange={setRecurrence}
            options={[
              { value: 'once',     label: 'One-off' },
              { value: 'daily',    label: 'Daily' },
              { value: 'weekdays', label: 'Weekdays' },
              { value: 'weekends', label: 'Weekends' },
              { value: 'weekly',   label: 'Weekly' },
            ]}
            hint="Recurring trips are posted one at a time for now."
          />
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Vehicle</CardTitle>
            <CardDescription>Pick the car you’ll drive on this trip.</CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onAddAnother}>Add another</Button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select
            label="Vehicle"
            value={vehicleId}
            onChange={(v) => { setVehicleId(v); setContributionDirty(false); }}
            options={vehicleOptions}
            placeholder="Select a vehicle"
            error={errors.vehicle}
          />
          <TextField
            label="Seats available"
            type="number"
            inputMode="numeric"
            min={1}
            max={7}
            value={seats}
            onChange={(e) => { setSeats(e.target.value); setContributionDirty(false); }}
            error={errors.seats}
            hint={vehicle ? `Your ${vehicle.make} ${vehicle.model} has ${vehicle.seats} seats.` : undefined}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Contribution</CardTitle>
        <CardDescription>
          TUJYANE calculates a fair per-seat contribution from the route and vehicle. You can adjust within ±{config.adjust_band_pct}% — no more.
        </CardDescription>

        {breakdown ? (
          <div className="mt-4 rounded-field bg-brand/10 border border-brand/25 p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs t-caption text-brand">Suggested</div>
              {breakdown.cappedByBus && breakdown.busFare != null && (
                <span className="inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand text-brand-fg">
                  Cheaper than the bus
                </span>
              )}
            </div>
            <div className="text-3xl font-bold tabular-nums text-text mt-1">{formatRWF(breakdown.suggested)}</div>
            <p className="text-xs text-text-muted mt-1">{breakdownLine(breakdown)}</p>
            <p className="text-xs text-text-muted mt-2">
              You can post anywhere from <span className="tabular-nums text-text font-semibold">{formatRWF(breakdown.low)}</span> to <span className="tabular-nums text-text font-semibold">{formatRWF(breakdown.high)}</span>
              {breakdown.hardCap != null && (
                <> — never above the bus fare <span className="tabular-nums text-text font-semibold">{formatRWF(breakdown.hardCap)}</span></>
              )}
              .
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-field bg-bg-elevated border border-border p-4 text-sm text-text-muted">
            Pick both places and a vehicle to see the calculated contribution.
          </div>
        )}

        <div className="mt-4">
          <TextField
            label="Contribution per seat (RWF)"
            type="number"
            inputMode="numeric"
            min={breakdown?.low ?? 0}
            max={breakdown?.high ?? undefined}
            step={100}
            value={contribution}
            onChange={(e) => { setContribution(e.target.value); setContributionDirty(true); }}
            error={errors.contribution}
            hint={breakdown ? `Allowed: ${formatRWF(breakdown.low)}–${formatRWF(breakdown.high)}.` : undefined}
            disabled={!breakdown}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Preferences</CardTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Toggle checked={luggage}   onChange={setLuggage}   label="Luggage allowed" />
          <Toggle checked={pets}      onChange={setPets}      label="Pets allowed" />
          <Toggle checked={smoking}   onChange={setSmoking}   label="Smoking allowed" />
        </div>

        <div className="mt-6">
          <label htmlFor="notes" className="text-sm font-medium text-text">Notes</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Anything else riders should know — pick-up spot, luggage limits, etc."
            className="mt-1.5 w-full min-h-24 rounded-field bg-surface border border-border px-3.5 py-3 text-[15px] text-text placeholder:text-text-subtle outline-none focus:border-brand focus:shadow-ring transition-[border-color,box-shadow] resize-y"
          />
        </div>
      </Card>

      {errors.form && (
        <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-field px-3 py-2">
          {errors.form}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={submitting}>Post journey</Button>
      </div>
    </form>
  );
}

function VehicleOrFormSkeleton() {
  return (
    <Card>
      <Skeleton widthClass="w-40" heightClass="h-6" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton widthClass="w-20" heightClass="h-3" />
            <Skeleton heightClass="h-12" />
          </div>
        ))}
      </div>
    </Card>
  );
}

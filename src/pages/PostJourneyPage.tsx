import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  findCorridorFare, listCorridorFares, loadPricingConfig,
  type CorridorFare, type Location, locationLabel,
} from '@/features/locations/api';
import { computeSuggested, type PricingBreakdown, type PricingConfig, withinBand, breakdownLine } from '@/lib/pricing';
import { useDataFetch } from '@/lib/useDataFetch';
import { formatRWF } from '@/lib/format';

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

  // Verification gate. Every driver must upload + get approved on national_id
  // and driving_license before posting a journey. During pilot this is a
  // product decision — no free-posting.
  if (!profile?.is_verified_driver) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Card className="!bg-warning/10 !border-warning/30">
          <div className="t-caption">Driver</div>
          <CardTitle>Get verified first</CardTitle>
          <CardDescription>
            Every driver must have an approved National ID and Driving license before posting.
            It usually takes under 24 hours.
          </CardDescription>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => nav('/dashboard/verification')}>Complete verification</Button>
            <Button variant="outline" onClick={() => nav('/dashboard')}>Back to overview</Button>
          </div>
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

function JourneyForm({
  vehicles, config, fares, onAddAnother, onCreated,
}: {
  vehicles: Vehicle[];
  config: PricingConfig;
  fares: CorridorFare[];
  onAddAnother: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();

  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<Recurrence>('once');
  const [vehicleId, setVehicleId] = useState<string | undefined>(vehicles[0]?.id);
  const [seats, setSeats] = useState<string>(String(Math.min(4, vehicles[0]?.seats ?? 4)));
  const [contribution, setContribution] = useState<string>('');
  const [contributionDirty, setContributionDirty] = useState(false);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const next: Errors = {};
    if (!origin)      next.origin = 'Pick where you start.';
    if (!destination) next.destination = 'Pick where you’re going.';
    if (!date)        next.date = 'Pick a date.';
    if (!time)        next.time = 'Pick a time.';
    if (!vehicleId)   next.vehicle = 'Select a vehicle.';

    if (!seats || Number.isNaN(seatsNum) || seatsNum < 1 || seatsNum > 7) {
      next.seats = 'Between 1 and 7.';
    } else if (vehicle && seatsNum > vehicle.seats) {
      next.seats = `Your vehicle has ${vehicle.seats} seats.`;
    }

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
      if (d.getTime() <= Date.now()) next.time = 'Departure must be in the future.';
      else departureIso = d.toISOString();
    }

    setErrors(next);
    if (Object.keys(next).length || !departureIso || !vehicleId || !origin || !destination || !breakdown) return;

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

  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${v.make} ${v.model}${v.year ? ` · ${v.year}` : ''}`,
    description: v.is_verified
      ? `${v.seats} seats · ${v.energy_type}`
      : `${v.seats} seats · ${v.energy_type} · Pending verification`,
  }));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
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

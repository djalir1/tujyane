import { useRef, useState } from 'react';
import { TextField } from '@/components/ds/TextField';
import { Select } from '@/components/ds/Select';
import { Button } from '@/components/ds/Button';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { useAuth } from '@/auth/useAuth';
import { useToast } from '@/components/ds/Toast';
import { afterErrorsRender } from '@/lib/formErrors';
import { normalisePlate, validatePlate } from '@/lib/validation';
import {
  ACCEPTED_VEHICLE_PHOTO_TYPES,
  MAX_VEHICLE_PHOTO_BYTES,
  MAX_VEHICLE_PHOTOS,
  createVehicle,
  uploadVehiclePhoto,
  type EnergyType,
  type Vehicle,
} from './api';

type Props = {
  onCreated: (v: Vehicle) => void;
  /** Optional cancel button (returns to prior state). */
  onCancel?: () => void;
};

type Errors = Partial<Record<
  'make' | 'model' | 'year' | 'plate_number' | 'seats' | 'photo' | 'form',
  string
>>;

const CURRENT_YEAR = new Date().getFullYear();

/** One selected local photo waiting to be uploaded on submit. Preview URLs
 * are revoked when the entry is removed to avoid leaking blob URLs. */
type PhotoDraft = { id: string; file: File; previewUrl: string };

function humanBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024)        return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export function AddVehicleForm({ onCreated, onCancel }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [color, setColor] = useState('');
  const [seats, setSeats] = useState('4');
  const [energy, setEnergy] = useState<EnergyType>('petrol');
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  /** Add newly-selected files, applying per-file validation and the 5-photo cap. */
  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setErrors((e) => ({ ...e, photo: undefined }));

    const errorsToShow: string[] = [];
    const drafts: PhotoDraft[] = [];
    let remaining = MAX_VEHICLE_PHOTOS - photos.length;

    for (const f of Array.from(picked)) {
      if (remaining <= 0) {
        errorsToShow.push(`You can upload up to ${MAX_VEHICLE_PHOTOS} photos.`);
        break;
      }
      if (!ACCEPTED_VEHICLE_PHOTO_TYPES.includes(f.type)) {
        errorsToShow.push(`${f.name}: only JPG, PNG or WEBP.`);
        continue;
      }
      if (f.size > MAX_VEHICLE_PHOTO_BYTES) {
        errorsToShow.push(`${f.name}: ${humanBytes(f.size)} — max 5 MB.`);
        continue;
      }
      drafts.push({
        id: `${f.name}-${f.size}-${crypto.randomUUID()}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
      });
      remaining -= 1;
    }

    if (drafts.length) setPhotos((p) => [...p, ...drafts]);
    if (errorsToShow.length) {
      setErrors((e) => ({ ...e, photo: errorsToShow.join(' ') }));
    }
    // Reset the file input so re-picking the same file works.
    if (fileRef.current) fileRef.current.value = '';
  }

  function removePhoto(id: string) {
    setPhotos((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return p.filter((x) => x.id !== id);
    });
    setErrors((e) => ({ ...e, photo: undefined }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const next: Errors = {};
    if (!make.trim())          next.make  = 'Required.';
    if (!model.trim())         next.model = 'Required.';
    const yr = Number(year);
    if (!year || Number.isNaN(yr) || yr < 1980 || yr > CURRENT_YEAR + 1) next.year = `Enter a year between 1980 and ${CURRENT_YEAR + 1}.`;
    const plateCheck = validatePlate(plate);
    if (!plateCheck.ok) next.plate_number = plateCheck.message;
    const st = Number(seats);
    if (!seats || Number.isNaN(st) || st < 1 || st > 20) next.seats = 'Between 1 and 20.';
    setErrors(next);
    if (Object.keys(next).length) {
      afterErrorsRender(formRef.current, (n) => {
        if (n > 0) toast.push({ kind: 'error', message: 'Please fix the highlighted fields.' });
      });
      return;
    }

    try {
      setSubmitting(true);
      // Upload in the order the driver picked, then keep that order in the DB.
      const urls: string[] = [];
      for (const p of photos) {
        try {
          const u = await uploadVehiclePhoto(user.id, p.file);
          urls.push(u);
        } catch (err) {
          const m = err instanceof Error ? err.message : 'Photo upload failed.';
          setErrors({ photo: m });
          setSubmitting(false);
          return;
        }
      }

      const v = await createVehicle(user.id, {
        make: make.trim(),
        model: model.trim(),
        year: yr,
        plate_number: normalisePlate(plate),
        color: color.trim() || null,
        seats: st,
        energy_type: energy,
        photo_urls: urls,
      });
      toast.push({ kind: 'success', title: 'Vehicle added', message: 'Pending verification — you can still post journeys during pilot.' });
      onCreated(v);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add the vehicle.';
      setErrors({ form: msg });
      toast.push({ kind: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardTitle>Add your vehicle</CardTitle>
      <CardDescription>
        You need at least one vehicle before posting a journey. After you save it, upload the vehicle
        documents from the Verification page so admins can review it.
      </CardDescription>

      <form ref={formRef} onSubmit={onSubmit} className="mt-5 grid gap-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Make" placeholder="Toyota" value={make} onChange={(e) => setMake(e.target.value)} error={errors.make} />
          <TextField label="Model" placeholder="RAV4" value={model} onChange={(e) => setModel(e.target.value)} error={errors.model} />
          <TextField label="Year" type="number" inputMode="numeric" placeholder={String(CURRENT_YEAR - 3)} value={year} onChange={(e) => setYear(e.target.value)} error={errors.year} />
          <TextField label="Plate number" placeholder="RAB 123 A" value={plate} onChange={(e) => setPlate(e.target.value)} error={errors.plate_number} />
          <TextField label="Color" placeholder="White" value={color} onChange={(e) => setColor(e.target.value)} />
          <TextField label="Seats" type="number" inputMode="numeric" placeholder="4" value={seats} onChange={(e) => setSeats(e.target.value)} error={errors.seats} hint="Total passenger seats." />
          <Select<EnergyType>
            label="Energy type"
            value={energy}
            onChange={setEnergy}
            options={[
              { value: 'petrol', label: 'Petrol' },
              { value: 'diesel', label: 'Diesel' },
              { value: 'hybrid', label: 'Hybrid' },
              { value: 'electric', label: 'Electric', description: 'EV — shown with ⚡ to riders' },
            ]}
          />
        </div>

        {/* Photos — occupies full width so up to 5 thumbs fit on desktop. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label className="text-sm font-medium text-text">Photos</label>
            <span className="text-xs text-text-muted">{photos.length}/{MAX_VEHICLE_PHOTOS}</span>
          </div>
          <p className="text-xs text-text-muted">
            Clear photo of the car with the number plate visible. Exterior front and
            side recommended. Up to {MAX_VEHICLE_PHOTOS} photos · JPG/PNG/WEBP · max 5 MB each.
          </p>

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div key={p.id} className="relative aspect-[4/3] rounded-field overflow-hidden border border-border bg-surface">
                  <img
                    src={p.previewUrl}
                    alt={`Vehicle preview ${i + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {i === 0 && (
                    <span className="absolute left-2 top-2 inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand text-brand-fg">
                      Primary
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-1.5 top-1.5 h-7 w-7 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photos.length >= MAX_VEHICLE_PHOTOS}
              className="h-11 px-4 rounded-field bg-surface border border-border text-sm font-semibold text-text hover:bg-surface-hover disabled:opacity-50"
            >
              {photos.length === 0 ? 'Choose photos' : 'Add another photo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {errors.photo && <p className="text-xs text-danger">{errors.photo}</p>}
        </div>

        {errors.form && (
          <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-field px-3 py-2">
            {errors.form}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" type="button" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={submitting}>Add vehicle</Button>
        </div>
      </form>
    </Card>
  );
}

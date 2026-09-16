import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { Select } from '@/components/ds/Select';
import { useToast } from '@/components/ds/Toast';
import { useAuth } from '@/auth/useAuth';
import {
  isVehicleDocType, latestByType, listMyDocuments, REQUIRED_DOCS,
  submitDocumentsForReview, uploadDocument,
  type DocStatus, type DocType, type DriverDocument,
} from '@/features/verification/api';
import { listMyVehicles, type Vehicle } from '@/features/vehicles/api';
import { useDataFetch } from '@/lib/useDataFetch';

type Bundle = { docs: DriverDocument[]; vehicles: Vehicle[] };

export default function DriverVerificationPage() {
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();

  const fetcher = useCallback(async (): Promise<Bundle> => {
    if (!user) return { docs: [], vehicles: [] };
    const [docs, vehicles] = await Promise.all([
      listMyDocuments(user.id),
      listMyVehicles(user.id),
    ]);
    return { docs, vehicles };
  }, [user]);

  const onError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not load your documents.';
      toast.push({ kind: 'error', message: msg });
    },
    [toast],
  );

  const { data, loading, refetch } = useDataFetch<Bundle>(
    fetcher,
    [user?.id],
    { enabled: Boolean(user), onError },
  );

  const latest = latestByType(data?.docs ?? []);
  const vehicles = data?.vehicles ?? [];
  const anyVehicleVerified = vehicles.some((v) => v.is_verified);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <header>
        <div className="t-caption">Driver</div>
        <h1 className="t-h1 text-text mt-1">Get verified</h1>
        <p className="mt-2 text-sm text-text-muted max-w-xl">
          Upload these four documents. Reviews usually take under 24 hours.
          Your personal verification and each car's verification are tracked
          separately — approving your vehicle registration + car photo verifies
          the specific car those documents are for.
        </p>
      </header>

      {loading ? (
        <div className="grid gap-3">
          <VerificationSkeletonRow />
          <VerificationSkeletonRow />
          <VerificationSkeletonRow />
          <VerificationSkeletonRow />
        </div>
      ) : (
        <>
          <Banner
            isVerifiedDriver={Boolean(profile?.is_verified_driver)}
            anyVehicleVerified={anyVehicleVerified}
            latest={latest}
          />

          <div className="grid gap-3">
            {REQUIRED_DOCS.map(({ type, label, description }) => (
              <DocRow
                key={type}
                type={type}
                label={label}
                description={description}
                doc={latest[type] ?? null}
                vehicles={vehicles}
                onUploaded={async () => {
                  await refetch();
                  await refreshProfile();
                }}
              />
            ))}
          </div>

          <VehicleStatusList vehicles={vehicles} />

          <SubmitForReviewStrip latest={latest} onSubmitted={async () => { await refetch(); await refreshProfile(); }} />

          <div className="pt-2 text-xs text-text-muted">
            Documents are stored privately. Only you and the review team can see them.
            {' '}<Link to="/dashboard/journeys" className="text-brand font-semibold">Back to my journeys</Link>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Banner (honest about the two verifications) ---------------- */
function Banner({
  isVerifiedDriver,
  anyVehicleVerified,
  latest,
}: {
  isVerifiedDriver: boolean;
  anyVehicleVerified: boolean;
  latest: Partial<Record<DocType, DriverDocument>>;
}) {
  const rejected = REQUIRED_DOCS.filter((r) => latest[r.type]?.status === 'rejected').length;
  const pending  = REQUIRED_DOCS.filter((r) => latest[r.type]?.status === 'pending').length;

  // ONLY show the full-green "You're verified" banner when BOTH sides pass —
  // otherwise the driver would tap "Post a journey" and hit the vehicle gate.
  if (isVerifiedDriver && anyVehicleVerified && rejected === 0) {
    return (
      <Card className="!bg-brand/10 !border-brand/30">
        <div className="flex items-center gap-3">
          <IconCheck />
          <div>
            <CardTitle>You're verified ✓</CardTitle>
            <CardDescription>Both your driver profile and at least one car are approved. You can post journeys.</CardDescription>
          </div>
        </div>
      </Card>
    );
  }

  // Partial: personal is done but no car yet. This is the exact contradiction
  // the pilot bug report called out — surface it explicitly.
  if (isVerifiedDriver && !anyVehicleVerified) {
    return (
      <Card className="!bg-warning/10 !border-warning/30">
        <div className="flex items-center gap-3">
          <IconClock />
          <div>
            <CardTitle>Personal verification approved — car still pending</CardTitle>
            <CardDescription>
              Your national ID and driving license are approved, but no vehicle
              is verified yet. Approving vehicle registration + car photo for a
              specific car unlocks posting journeys on that car.
            </CardDescription>
          </div>
        </div>
      </Card>
    );
  }
  if (rejected > 0) {
    return (
      <Card className="!bg-danger/10 !border-danger/30">
        <div className="flex items-center gap-3">
          <IconWarn />
          <div>
            <CardTitle>Action needed</CardTitle>
            <CardDescription>
              {rejected} document{rejected > 1 ? 's were' : ' was'} rejected. Re-upload below and we'll review again.
            </CardDescription>
          </div>
        </div>
      </Card>
    );
  }
  if (pending > 0) {
    return (
      <Card className="!bg-warning/10 !border-warning/30">
        <div className="flex items-center gap-3">
          <IconClock />
          <div>
            <CardTitle>Verification pending</CardTitle>
            <CardDescription>We're reviewing your documents — this usually takes under 24 hours.</CardDescription>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <CardTitle>Start your verification</CardTitle>
      <CardDescription>Upload each document below. You can do them one at a time.</CardDescription>
    </Card>
  );
}

/* ---------------- Per-vehicle status list ---------------- */
function VehicleStatusList({ vehicles }: { vehicles: Vehicle[] }) {
  if (vehicles.length === 0) return null;
  return (
    <Card>
      <CardTitle>Your cars</CardTitle>
      <CardDescription>Each car is verified separately. Vehicle docs above unlock the car you selected.</CardDescription>
      <div className="mt-4 grid gap-2">
        {vehicles.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 rounded-field border border-border bg-surface px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text truncate">
                {v.make} {v.model}{v.year ? ` · ${v.year}` : ''}
              </div>
              <div className="text-xs text-text-muted truncate">{v.plate_number}{v.color ? ` · ${v.color}` : ''}</div>
            </div>
            <span
              className={[
                'inline-flex items-center h-6 px-2.5 rounded-pill text-[10px] font-bold uppercase tracking-wider',
                v.is_verified ? 'bg-brand/15 text-brand' : 'bg-warning/15 text-warning',
              ].join(' ')}
            >
              {v.is_verified ? 'Approved' : 'Pending'}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- Doc row + upload control ---------------- */
function DocRow({
  type, label, description, doc, vehicles, onUploaded,
}: {
  type: DocType;
  label: string;
  description: string;
  doc: DriverDocument | null;
  vehicles: Vehicle[];
  onUploaded: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  // For vehicle docs the driver must pick which car this doc is for. If they
  // only have one, we default to it silently.
  const singleVehicle = vehicles.length === 1 ? vehicles[0]?.id ?? '' : '';
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(doc?.vehicle_id ?? singleVehicle);
  const isVehicleDoc = isVehicleDocType(type);

  const status: DocStatus | 'none' = doc?.status ?? 'none';

  async function submit(file: File) {
    if (!user) return;
    // Vehicle-doc integrity check — server also enforces, but bail early with
    // a friendly message rather than the storage upload happening for nothing.
    if (isVehicleDoc) {
      if (vehicles.length === 0) {
        toast.push({ kind: 'error', message: 'Add a vehicle first, then upload its documents.' });
        return;
      }
      if (!selectedVehicleId) {
        toast.push({ kind: 'error', message: 'Pick which vehicle this document is for.' });
        return;
      }
    }
    try {
      setBusy(true);
      await uploadDocument(user.id, type, file, isVehicleDoc ? selectedVehicleId : null);
      toast.push({ kind: 'success', title: 'Uploaded', message: `${label} saved. Click "Send for verification" when you're done uploading.` });
      await onUploaded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      toast.push({ kind: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-semibold text-text">{label}</div>
            <StatusPill status={status} />
          </div>
          <p className="mt-1 text-xs text-text-muted">{description}</p>
          {isVehicleDoc && (
            <div className="mt-3 max-w-sm">
              <Select
                label="For which vehicle?"
                value={selectedVehicleId || undefined}
                onChange={(v) => setSelectedVehicleId(v ?? '')}
                options={vehicles.map((v) => ({
                  value: v.id,
                  label: `${v.make} ${v.model}${v.year ? ` · ${v.year}` : ''} · ${v.plate_number}`,
                  description: v.is_verified ? 'Approved' : 'Pending verification',
                }))}
                placeholder={vehicles.length === 0 ? 'Add a vehicle first' : 'Pick your car'}
                hint="Approving this document verifies the car you pick."
              />
            </div>
          )}
          {doc && (
            <p className="mt-2 text-xs text-text-muted break-all">
              File: <span className="tabular-nums text-text">{doc.file_url.split('/').pop()}</span>
              {doc.vehicle_id && vehicles.find((v) => v.id === doc.vehicle_id) && (
                <> · linked to {vehicles.find((v) => v.id === doc.vehicle_id)?.make} {vehicles.find((v) => v.id === doc.vehicle_id)?.model}</>
              )}
            </p>
          )}
          {status === 'rejected' && doc?.rejection_reason && (
            <p className="mt-2 text-xs text-danger">Reason: {doc.rejection_reason}</p>
          )}
        </div>

        <div className="w-full sm:w-auto">
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void submit(f);
            }}
            className={[
              'flex flex-col items-center justify-center gap-1 w-full sm:w-[200px] h-24 px-4',
              'rounded-field border-2 border-dashed cursor-pointer transition-colors',
              drag ? 'border-brand bg-brand/10' : 'border-border hover:border-text-muted bg-bg-elevated',
              busy || (isVehicleDoc && !selectedVehicleId) ? 'opacity-70 pointer-events-none' : '',
            ].join(' ')}
          >
            <UploadIcon />
            <span className="text-xs font-semibold text-text">
              {status === 'none' ? 'Upload' : status === 'rejected' ? 'Re-upload' : 'Replace'}
            </span>
            <span className="text-[10px] text-text-muted">JPG · PNG · WEBP · PDF · ≤5 MB</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void submit(f);
                if (inputRef.current) inputRef.current.value = '';
              }}
            />
          </label>
          {busy && (
            <div className="mt-2 text-center">
              <Button size="sm" loading disabled variant="ghost">Uploading</Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Bottom strip: prompts the driver to explicitly "Send for verification" once
 * they've uploaded documents. Nothing lands in the admin queue until they do
 * — this was the second root cause of the empty-queue bug.
 */
function SubmitForReviewStrip({
  latest,
  onSubmitted,
}: {
  latest: Partial<Record<DocType, DriverDocument>>;
  onSubmitted: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const drafts = REQUIRED_DOCS.filter((r) => latest[r.type]?.status === 'draft').length;
  const uploadedTotal = REQUIRED_DOCS.filter((r) => latest[r.type]).length;

  if (drafts === 0) return null;

  const readyForReview = uploadedTotal >= 2;
  return (
    <Card className="!bg-brand/10 !border-brand/30">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="min-w-0">
          <CardTitle>Ready to send for verification?</CardTitle>
          <CardDescription>
            {drafts} document{drafts === 1 ? '' : 's'} uploaded but not yet sent. Our review team can't see them until you submit.
          </CardDescription>
        </div>
        <div className="shrink-0">
          <Button
            loading={busy}
            disabled={!readyForReview}
            onClick={async () => {
              try {
                setBusy(true);
                const n = await submitDocumentsForReview();
                toast.push({
                  kind: 'success',
                  title: 'Sent for verification',
                  message: `${n} document${n === 1 ? '' : 's'} moved to review. We usually respond within 24 hours.`,
                });
                await onSubmitted();
              } catch (err) {
                toast.push({ kind: 'error', message: err instanceof Error ? err.message : 'Could not submit.' });
              } finally {
                setBusy(false);
              }
            }}
          >
            Send for verification
          </Button>
        </div>
      </div>
      {!readyForReview && (
        <p className="mt-3 text-xs text-text-muted">
          Upload at least your National ID and Driving license before sending.
        </p>
      )}
    </Card>
  );
}

function StatusPill({ status }: { status: DocStatus | 'none' }) {
  const map: Record<DocStatus | 'none', { label: string; cls: string }> = {
    none:     { label: 'Not uploaded', cls: 'bg-surface-hover text-text-muted' },
    draft:    { label: 'Uploaded — not sent', cls: 'bg-warning/15 text-warning' },
    pending:  { label: 'Pending review', cls: 'bg-warning/15 text-warning' },
    approved: { label: 'Approved', cls: 'bg-brand/15 text-brand' },
    rejected: { label: 'Rejected', cls: 'bg-danger/15 text-danger' },
  };
  const m = map[status];
  return (
    <span className={['inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider', m.cls].join(' ')}>
      {m.label}
    </span>
  );
}

function VerificationSkeletonRow() {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton widthClass="w-40" heightClass="h-4" />
          <Skeleton widthClass="w-3/5" heightClass="h-3" />
        </div>
        <Skeleton widthClass="w-40" heightClass="h-20" />
      </div>
    </Card>
  );
}

/* ---------------- icons ---------------- */
function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className="text-text-muted">
      <path d="M12 15V4M8 8l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden className="text-brand">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="M7 12.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden className="text-warning">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="M12 7v6l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconWarn() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden className="text-danger">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

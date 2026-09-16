import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';
import { Avatar } from '@/components/layout/UserMenu';
import { useDataFetch } from '@/lib/useDataFetch';
import {
  approveDoc, approveVehicle, loadDriverReview, rejectDoc,
  type DriverReviewBundle,
} from '@/features/admin/api';
import { isVehicleDocType, REQUIRED_DOCS, signedDocUrl, type DocType, type DriverDocument } from '@/features/verification/api';

export default function AdminReviewPage() {
  const { driverId = '' } = useParams();
  const toast = useToast();

  const fetcher = useCallback(async () => await loadDriverReview(driverId), [driverId]);
  const onError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Could not load driver.';
    toast.push({ kind: 'error', message: msg });
  }, [toast]);

  const { data, loading, refetch } = useDataFetch<DriverReviewBundle>(
    fetcher, [driverId], { enabled: Boolean(driverId), onError });

  const [rejecting, setRejecting] = useState<DriverDocument | null>(null);

  const driver = data?.driver;
  const docs   = data?.documents ?? [];
  const vehicles = data?.vehicles ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <Link to="/admin" className="text-sm text-text-muted hover:text-text">← Back to queue</Link>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Refresh</Button>
      </header>

      {loading ? (
        <>
          <Skeleton widthClass="w-3/5" heightClass="h-8" />
          <div className="grid gap-3 mt-4">
            <Skeleton heightClass="h-32" />
            <Skeleton heightClass="h-32" />
          </div>
        </>
      ) : !driver ? (
        <Card>
          <CardTitle>Driver not found</CardTitle>
          <CardDescription>The driver may have been removed.</CardDescription>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center gap-3">
              <Avatar name={driver.full_name} url={driver.avatar_url} size={44} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text truncate">
                  {driver.full_name}
                  {driver.is_verified_driver && <span className="ml-1 text-xs text-brand">· verified</span>}
                </div>
                <div className="text-xs text-text-muted">
                  {driver.phone ?? 'No phone'} · ★ {driver.rating_count ? driver.rating_avg.toFixed(1) : '—'}
                </div>
              </div>
            </div>
          </Card>

          <section>
            <h2 className="t-h3 text-text mt-2 mb-2">Personal documents</h2>
            <div className="grid gap-3">
              {REQUIRED_DOCS.filter((r) => !isVehicleDocType(r.type)).map(({ type, label }) => {
                const doc = latestFor(type, docs);
                return (
                  <DocReviewCard
                    key={type}
                    label={label}
                    doc={doc}
                    vehicleLabel={null}
                    onApproved={refetch}
                    onRejectClick={() => setRejecting(doc)}
                  />
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="t-h3 text-text mt-4 mb-2">Vehicle documents</h2>
            {vehicles.length === 0 ? (
              <p className="text-sm text-text-muted">Driver has no vehicles yet.</p>
            ) : (
              vehicles.map((v) => {
                const vehicleLabel = `${v.make} ${v.model}${v.year ? ` · ${v.year}` : ''} · ${v.plate_number}`;
                // Orphan check: any vehicle-type doc from this driver that
                // isn't linked to a specific vehicle yet. Common for pre-Batch-V
                // uploads. Admin needs to nudge the driver to re-upload.
                const orphanNote = docs.some((d) => isVehicleDocType(d.doc_type) && d.vehicle_id === null)
                  ? 'This driver has vehicle documents not linked to any specific car. They must re-upload with a vehicle chosen so approvals verify the right car.'
                  : null;
                return (
                  <div key={v.id} className="mb-4">
                    <div className="text-sm font-semibold text-text mb-2">{vehicleLabel}</div>
                    <div className="grid gap-3">
                      {REQUIRED_DOCS.filter((r) => isVehicleDocType(r.type)).map(({ type, label }) => {
                        const doc = latestForVehicle(type, v.id, docs);
                        return (
                          <DocReviewCard
                            key={`${v.id}-${type}`}
                            label={label}
                            doc={doc}
                            vehicleLabel={vehicleLabel}
                            onApproved={refetch}
                            onRejectClick={() => setRejecting(doc)}
                          />
                        );
                      })}
                    </div>
                    {orphanNote && (
                      <p className="mt-2 text-xs text-warning">{orphanNote}</p>
                    )}
                  </div>
                );
              })
            )}
          </section>

          <section>
            <h2 className="t-h3 text-text mt-4 mb-2">Vehicles</h2>
            {vehicles.length === 0 ? (
              <p className="text-sm text-text-muted">No vehicles yet.</p>
            ) : (
              <div className="grid gap-3">
                {vehicles.map((v) => (
                  <Card key={v.id}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text truncate">
                          {v.make} {v.model} {v.year ? `· ${v.year}` : ''}
                        </div>
                        <div className="text-xs text-text-muted">
                          Plate {v.plate_number} · {v.seats} seats · {v.energy_type}
                          {v.color ? ` · ${v.color}` : ''}
                        </div>
                      </div>
                      {v.is_verified ? (
                        <span className="inline-flex items-center h-6 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand">Verified</span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await approveVehicle(v.id);
                              toast.push({ kind: 'success', message: 'Vehicle verified.' });
                              await refetch();
                            } catch (err) {
                              const msg = err instanceof Error ? err.message : 'Could not verify.';
                              toast.push({ kind: 'error', message: msg });
                            }
                          }}
                        >
                          Verify vehicle
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {rejecting && (
        <RejectDialog
          doc={rejecting}
          onClose={() => setRejecting(null)}
          onSubmitted={async () => {
            setRejecting(null);
            await refetch();
          }}
        />
      )}
    </div>
  );
}

function latestFor(type: DocType, all: DriverDocument[]): DriverDocument | null {
  const filtered = all.filter((d) => d.doc_type === type);
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => (a.created_at > b.created_at ? a : b));
}

function latestForVehicle(type: DocType, vehicleId: string, all: DriverDocument[]): DriverDocument | null {
  const filtered = all.filter((d) => d.doc_type === type && d.vehicle_id === vehicleId);
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => (a.created_at > b.created_at ? a : b));
}

/**
 * Doc review card — one document at a time.
 *
 * FUTURE: an AI pre-screen (OCR + doc-authenticity heuristics) will run when
 * a doc is submitted and post a summary here — "Extracted plate matches
 * vehicle record", "Expiry date matches ID card issue date", etc. It will be
 * ADVISORY only; the admin remains the final decision-maker. For the pilot
 * this card is entirely manual: admin previews the file + the driver-entered
 * data (issue/expiry/ref#) THEN approves. No blind approve.
 */
function DocReviewCard({
  label, doc, vehicleLabel, onApproved, onRejectClick,
}: {
  label: string;
  doc: DriverDocument | null;
  /** When present, this is a vehicle doc and we render the target vehicle
   * name so admins are sure which car they're verifying. */
  vehicleLabel: string | null;
  onApproved: () => Promise<void> | void;
  onRejectClick: () => void;
}) {
  const toast = useToast();
  const [signed, setSigned] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'approve'>(null);

  useEffect(() => {
    let alive = true;
    setSigned(null); setSignError(null);
    if (!doc) return;
    void signedDocUrl(doc.file_url, 300)
      .then((u) => { if (alive) setSigned(u); })
      .catch((err) => {
        if (!alive) return;
        setSignError(err instanceof Error ? err.message : 'Could not fetch document.');
      });
    return () => { alive = false; };
  }, [doc?.id]);

  const isPdf = doc?.file_url.toLowerCase().endsWith('.pdf');

  return (
    <Card>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="md:w-72 shrink-0">
          <div className="text-sm font-semibold text-text">{label}</div>
          {vehicleLabel && (
            <div className="mt-0.5 text-[11px] font-medium text-text-muted">for {vehicleLabel}</div>
          )}
          {doc ? (
            <>
              <div className="mt-1 text-xs text-text-muted">
                Uploaded {new Date(doc.created_at).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              <StatusPill status={doc.status} className="mt-2" />
              {doc.status === 'rejected' && doc.rejection_reason && (
                <p className="mt-2 text-xs text-danger">Reason: {doc.rejection_reason}</p>
              )}
            </>
          ) : (
            <p className="mt-1 text-xs text-text-muted">Not uploaded.</p>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="rounded-field bg-bg border border-border h-52 grid place-items-center overflow-hidden">
            {!doc ? (
              <span className="text-xs text-text-muted">No file yet</span>
            ) : signError ? (
              // Storage-side "Object not found" surfaces here. Historically
              // was caused by driver_documents rows pointing at keys that
              // don't exist in the bucket (seed-data mismatch). Present it as
              // an actionable "ask the driver to re-upload" instead of a scary
              // technical string.
              <div className="text-center px-4">
                <div className="text-xs font-semibold text-danger">File missing from storage</div>
                <div className="text-[11px] text-text-muted mt-1 break-all">
                  {signError.replace(/^statusCode.*?:\s*/i, '')}
                </div>
                <div className="text-[11px] text-text-muted mt-1">Ask the driver to re-upload this document.</div>
              </div>
            ) : !signed ? (
              <Skeleton widthClass="w-3/5" heightClass="h-6" />
            ) : isPdf ? (
              <a href={signed} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand">
                Open PDF ↗
              </a>
            ) : (
              <a href={signed} target="_blank" rel="noreferrer" className="block h-full w-full">
                <img
                  src={signed}
                  alt={label}
                  className="h-full w-full object-contain bg-white"
                  onError={() => setSignError('Object not found in bucket.')}
                />
              </a>
            )}
          </div>

          {/* Data the driver entered — visible BEFORE the admin approves. */}
          {doc && (doc.issue_date || doc.expiry_date || doc.doc_number) && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              {doc.issue_date && (
                <div>
                  <div className="t-caption">Issued</div>
                  <div className="text-text font-semibold">{new Date(doc.issue_date).toLocaleDateString()}</div>
                </div>
              )}
              {doc.expiry_date && (
                <div>
                  <div className="t-caption">Expires</div>
                  <div className={['font-semibold', new Date(doc.expiry_date) < new Date() ? 'text-danger' : 'text-text'].join(' ')}>
                    {new Date(doc.expiry_date).toLocaleDateString()}
                  </div>
                </div>
              )}
              {doc.doc_number && (
                <div>
                  <div className="t-caption">Ref #</div>
                  <div className="text-text font-semibold break-all">{doc.doc_number}</div>
                </div>
              )}
            </div>
          )}

          {doc && doc.status === 'pending' && (
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onRejectClick}>Reject</Button>
              <Button
                size="sm"
                loading={busy === 'approve'}
                onClick={async () => {
                  try {
                    setBusy('approve');
                    await approveDoc(doc.id);
                    toast.push({ kind: 'success', message: `${label} approved.` });
                    await onApproved();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Could not approve.';
                    toast.push({ kind: 'error', message: msg });
                  } finally { setBusy(null); }
                }}
              >
                Approve
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function RejectDialog({
  doc, onClose, onSubmitted,
}: {
  doc: DriverDocument;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();
  const disabled = trimmed.length < 4;

  async function submit() {
    if (disabled) return;
    try {
      setBusy(true);
      await rejectDoc(doc.id, trimmed);
      toast.push({ kind: 'info', message: 'Document rejected.' });
      await onSubmitted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reject.';
      toast.push({ kind: 'error', message: msg });
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true"
        className="relative w-full max-w-md rounded-card bg-bg-elevated border border-border shadow-elevate p-6">
        <h2 className="t-h2 text-text">Reject document</h2>
        <p className="text-sm text-text-muted mt-1">
          The driver will see this reason. Keep it short and specific.
        </p>
        <label htmlFor="reject-reason" className="mt-4 block text-sm font-medium text-text">Reason</label>
        <textarea
          id="reject-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Image is blurry — please re-take in bright light."
          className="mt-1.5 w-full min-h-20 rounded-field bg-surface border border-border px-3.5 py-3 text-[15px] text-text placeholder:text-text-subtle outline-none focus:border-brand focus:shadow-ring transition-[border-color,box-shadow] resize-y"
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={disabled} onClick={submit}>Reject</Button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status, className = '' }: { status: DriverDocument['status']; className?: string }) {
  const map: Record<DriverDocument['status'], { label: string; cls: string }> = {
    draft:    { label: 'Draft — not sent', cls: 'bg-surface-hover text-text-muted' },
    pending:  { label: 'Pending review', cls: 'bg-warning/15 text-warning' },
    approved: { label: 'Approved', cls: 'bg-brand/15 text-brand' },
    rejected: { label: 'Rejected', cls: 'bg-danger/15 text-danger' },
  };
  const m = map[status];
  return (
    <span className={['inline-flex items-center h-5 px-2 rounded-pill text-[10px] font-bold uppercase tracking-wider', m.cls, className].join(' ')}>
      {m.label}
    </span>
  );
}

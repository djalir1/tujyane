import { supabase } from '@/lib/supabase';

export type DocType =
  | 'national_id'
  | 'driving_license'
  | 'vehicle_registration'
  | 'insurance_certificate'
  | 'inspection_certificate'
  | 'car_photo';
export type DocStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type DriverDocument = {
  id: string;
  driver_id: string;
  /** Required for every VEHICLE_DOC_TYPES entry. Null for personal docs. */
  vehicle_id: string | null;
  doc_type: DocType;
  file_url: string;              // storage path (bucket-relative), not a public URL
  status: DocStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  /** Applies to docs that have a validity window (insurance, inspection,
   * sometimes vehicle_registration). Null for docs without an expiry. */
  issue_date: string | null;     // ISO date (YYYY-MM-DD)
  expiry_date: string | null;    // ISO date
  /** Optional reference printed on the doc (policy number, inspection id). */
  doc_number: string | null;
  created_at: string;
  updated_at: string;
};

/** Which docs relate to a vehicle vs a person. */
export const VEHICLE_DOC_TYPES: DocType[] = [
  'vehicle_registration',
  'insurance_certificate',
  'inspection_certificate',
  'car_photo',
];
export function isVehicleDocType(t: DocType): boolean { return VEHICLE_DOC_TYPES.includes(t); }

/** Doc types that carry an expiry date. */
export const EXPIRING_DOC_TYPES: DocType[] = ['insurance_certificate', 'inspection_certificate', 'vehicle_registration'];
export function isExpiringDocType(t: DocType): boolean { return EXPIRING_DOC_TYPES.includes(t); }

/** Kinyarwanda labels are added where I have a confident translation. Ones
 * I'm less sure about are left with just the English name — do NOT invent
 * official-sounding Kinyarwanda that isn't. Edit `rw` where needed. */
export const REQUIRED_DOCS: {
  type: DocType;
  label: string;
  rwLabel?: string;
  description: string;
  requiresExpiry?: boolean;
}[] = [
  // Driver (person) — same for every car.
  { type: 'national_id',            label: 'National ID',            rwLabel: 'Indangamuntu',            description: 'Clear photo of both sides.' },
  { type: 'driving_license',        label: 'Driving license',        rwLabel: 'Uruhushya rwo gutwara', description: 'Front side, all corners visible.' },
  // Vehicle (per car).
  { type: 'vehicle_registration',   label: 'Vehicle registration (yellow card)', rwLabel: 'Ikarita y’umuhondo', description: 'The yellow card for your car.' },
  { type: 'insurance_certificate',  label: 'Insurance certificate',  rwLabel: 'Ubwishingizi',            description: 'Current insurance — include the expiry date.', requiresExpiry: true },
  { type: 'inspection_certificate', label: 'Vehicle inspection (control technique)', rwLabel: 'Kontorole tekiniki', description: 'Latest inspection cert — include the expiry date.', requiresExpiry: true },
  { type: 'car_photo',              label: 'Car photo',              rwLabel: 'Ifoto y’imodoka', description: 'Full car with plate readable.' },
];

export const BUCKET = 'driver-docs';
export const MAX_BYTES = 5 * 1024 * 1024;

export async function listMyDocuments(driverId: string): Promise<DriverDocument[]> {
  const { data, error } = await supabase
    .from('driver_documents')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DriverDocument[];
}

/** Group the latest doc row per doc_type (across all vehicles).
 *  Use for the personal-doc section only — vehicle docs need per-vehicle
 *  grouping via latestPerVehicleByType. */
export function latestByType(rows: DriverDocument[]): Partial<Record<DocType, DriverDocument>> {
  const out: Partial<Record<DocType, DriverDocument>> = {};
  for (const r of rows) {
    const cur = out[r.doc_type];
    if (!cur || new Date(r.created_at) > new Date(cur.created_at)) out[r.doc_type] = r;
  }
  return out;
}

/** Return the latest doc of `type` for a given vehicle_id, or null. */
export function latestForVehicle(
  rows: DriverDocument[], type: DocType, vehicleId: string,
): DriverDocument | null {
  let best: DriverDocument | null = null;
  for (const r of rows) {
    if (r.doc_type !== type) continue;
    if (r.vehicle_id !== vehicleId) continue;
    if (!best || new Date(r.created_at) > new Date(best.created_at)) best = r;
  }
  return best;
}

/** Convenience: is a stored expiry date in the past? */
export function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso + 'T23:59:59');
  return d.getTime() < Date.now();
}
export function daysUntilExpiry(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + 'T23:59:59').getTime();
  return Math.ceil((d - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * Uploads a document to the private `driver-docs` bucket and upserts the
 * driver_documents row. Re-uploading over a rejected doc flips it back to
 * 'pending' with cleared rejection_reason. `upsert:true` on storage lets a
 * driver replace their own file while it's still pending review.
 */
export type UploadDocumentExtras = {
  vehicleId?: string | null;
  /** ISO date YYYY-MM-DD. Required by the client for insurance/inspection. */
  issueDate?: string | null;
  /** ISO date YYYY-MM-DD. Required by the client for insurance/inspection. */
  expiryDate?: string | null;
  /** Optional identifier printed on the doc (policy number, inspection id). */
  docNumber?: string | null;
};

export async function uploadDocument(
  driverId: string,
  docType: DocType,
  file: File,
  extras: UploadDocumentExtras = {},
): Promise<DriverDocument> {
  if (file.size > MAX_BYTES) {
    throw new Error('That file is over 5 MB. Please compress or crop and try again.');
  }
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!ok.includes(file.type)) {
    throw new Error('Use a JPG, PNG, WEBP or PDF.');
  }
  const vehicleId = extras.vehicleId ?? null;
  if (isVehicleDocType(docType) && !vehicleId) {
    throw new Error('Pick which vehicle this document is for before uploading.');
  }
  if (isExpiringDocType(docType) && !extras.expiryDate) {
    throw new Error('This document requires an expiry date.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${driverId}/${docType}-${crypto.randomUUID()}.${ext}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '600',
    upsert: false,
    contentType: file.type,
  });
  if (up.error) throw up.error;

  const { data, error } = await supabase
    .from('driver_documents')
    .insert({
      driver_id: driverId,
      doc_type: docType,
      vehicle_id: vehicleId,
      file_url: path,
      status: 'draft',
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      issue_date:  extras.issueDate  ?? null,
      expiry_date: extras.expiryDate ?? null,
      doc_number:  extras.docNumber?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DriverDocument;
}

/**
 * Flips all of the caller's `draft` documents to `pending` in one call, then
 * inserts a docs.submitted audit event. Returns the number of rows moved.
 */
export async function submitDocumentsForReview(): Promise<number> {
  const { data, error } = await supabase.rpc('submit_documents_for_review');
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/**
 * Mints a short-lived signed URL for a stored document. Requires the caller
 * to have RLS-select on the object (owner or admin).
 */
export async function signedDocUrl(path: string, expiresIn = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

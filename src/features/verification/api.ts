import { supabase } from '@/lib/supabase';

export type DocType = 'national_id' | 'driving_license' | 'vehicle_registration' | 'car_photo';
export type DocStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type DriverDocument = {
  id: string;
  driver_id: string;
  /** Required for vehicle_registration / car_photo (post-Batch-V migration).
   * Null for personal docs. Approving a vehicle doc only verifies a vehicle
   * when this is set. */
  vehicle_id: string | null;
  doc_type: DocType;
  file_url: string;           // storage path (bucket-relative), not a public URL
  status: DocStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** Which docs relate to a vehicle vs a person. */
export const VEHICLE_DOC_TYPES: DocType[] = ['vehicle_registration', 'car_photo'];
export function isVehicleDocType(t: DocType): boolean { return VEHICLE_DOC_TYPES.includes(t); }

export const REQUIRED_DOCS: { type: DocType; label: string; description: string }[] = [
  { type: 'national_id',          label: 'National ID',          description: 'Clear photo of both sides.' },
  { type: 'driving_license',      label: 'Driving license',      description: 'Front side, all corners visible.' },
  { type: 'vehicle_registration', label: 'Vehicle registration', description: 'The yellow card for your car.' },
  { type: 'car_photo',            label: 'Car photo',            description: 'Full car with plate readable.' },
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

/** Group the latest doc row per doc_type. Older duplicates are ignored. */
export function latestByType(rows: DriverDocument[]): Partial<Record<DocType, DriverDocument>> {
  const out: Partial<Record<DocType, DriverDocument>> = {};
  for (const r of rows) {
    const cur = out[r.doc_type];
    if (!cur || new Date(r.created_at) > new Date(cur.created_at)) out[r.doc_type] = r;
  }
  return out;
}

/**
 * Uploads a document to the private `driver-docs` bucket and upserts the
 * driver_documents row. Re-uploading over a rejected doc flips it back to
 * 'pending' with cleared rejection_reason. `upsert:true` on storage lets a
 * driver replace their own file while it's still pending review.
 */
export async function uploadDocument(
  driverId: string,
  docType: DocType,
  file: File,
  /** Required when docType is a vehicle doc — server links the approval to
   * this exact vehicle so vehicles.is_verified flips when approved. If null,
   * approval falls back to auto-linking only when the driver has exactly one
   * vehicle. */
  vehicleId: string | null = null,
): Promise<DriverDocument> {
  if (file.size > MAX_BYTES) {
    throw new Error('That file is over 5 MB. Please compress or crop and try again.');
  }
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!ok.includes(file.type)) {
    throw new Error('Use a JPG, PNG, WEBP or PDF.');
  }
  if (isVehicleDocType(docType) && !vehicleId) {
    throw new Error('Pick which vehicle this document is for before uploading.');
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

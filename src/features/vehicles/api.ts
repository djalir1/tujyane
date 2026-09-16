import { supabase } from '@/lib/supabase';

export type EnergyType = 'petrol' | 'diesel' | 'hybrid' | 'electric';

export type Vehicle = {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number | null;
  plate_number: string;
  color: string | null;
  seats: number;
  energy_type: EnergyType;
  /** Legacy primary photo. Mirrors photo_urls[0] on newly-created rows. */
  photo_url: string | null;
  /** All uploaded photos, up to 5. Ordered driver-supplied. */
  photo_urls: string[];
  is_verified: boolean;
  created_at: string;
};

const VEHICLE_COLS =
  'id, owner_id, make, model, year, plate_number, color, seats, energy_type, photo_url, photo_urls, is_verified, created_at';

export const MAX_VEHICLE_PHOTOS = 5;
export const MAX_VEHICLE_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const ACCEPTED_VEHICLE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function listMyVehicles(userId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_COLS)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Vehicle[];
}

export type CreateVehicleInput = {
  make: string;
  model: string;
  year: number | null;
  plate_number: string;
  color: string | null;
  seats: number;
  energy_type: EnergyType;
  /** Full ordered list, up to MAX_VEHICLE_PHOTOS. First is used as the
   * primary photo mirror to `photo_url`. */
  photo_urls: string[];
};

export async function createVehicle(userId: string, input: CreateVehicleInput): Promise<Vehicle> {
  const primary = input.photo_urls[0] ?? null;
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      owner_id: userId,
      make: input.make,
      model: input.model,
      year: input.year,
      plate_number: input.plate_number,
      color: input.color,
      seats: input.seats,
      energy_type: input.energy_type,
      photo_url: primary,
      photo_urls: input.photo_urls,
    })
    .select(VEHICLE_COLS)
    .single();
  if (error) throw mapVehicleError(error);
  return data as Vehicle;
}

function mapVehicleError(err: { message?: string; code?: string }): Error {
  const raw = err.message ?? 'Could not add the vehicle.';
  if (/vehicles_plate_unique_idx|duplicate key.*plate/i.test(raw)) {
    return new Error('That plate number is already registered on TUJYANE.');
  }
  if (/vehicles_plate_rw_format/i.test(raw)) {
    return new Error('Use the Rwandan plate format, e.g. RAB 123 A.');
  }
  return new Error(raw);
}

/**
 * Uploads a vehicle photo under the user's folder to satisfy the storage RLS
 * policy (first path segment == auth.uid()). Returns a public URL.
 */
export async function uploadVehiclePhoto(userId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage
    .from('vehicle-photos')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;

  const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path);
  return data.publicUrl;
}

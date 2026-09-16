import { supabase } from '@/lib/supabase';
import type { RoleIntent } from '@/lib/database.types';
import { normalizeRwandaPhone } from '@/lib/validators';

export type UpdateProfileInput = {
  full_name: string;
  phone: string | null;    // caller passes normalised value or null
  role_intent: RoleIntent;
  avatar_url?: string | null;
};

/** Owner-only per RLS: profiles_update_self. */
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: input.full_name.trim(),
      phone: input.phone,
      role_intent: input.role_intent,
      ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url } : {}),
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Avatars are public-safe: stored in the same `vehicle-photos` bucket under
 * an `avatars/{userId}/…` prefix so we don't need a second public bucket.
 * (The storage RLS allows insert only if the first path segment matches the
 * caller — so we use `{userId}/…` shape.)
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const safe = ['jpg','jpeg','png','webp'].includes(ext) ? ext : 'jpg';
  const path = `${userId}/avatar-${crypto.randomUUID()}.${safe}`;
  const { error } = await supabase.storage
    .from('vehicle-photos')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path);
  return data.publicUrl;
}

export function normalizeMaybePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return normalizeRwandaPhone(trimmed);
}

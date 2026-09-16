import { supabase } from '@/lib/supabase';

export type Rating = {
  id: string;
  booking_id: string;
  rater_id: string;
  ratee_id: string;
  score: number;
  comment: string | null;
  created_at: string;
};

export async function listRatingsForBookings(bookingIds: string[]): Promise<Rating[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .in('booking_id', bookingIds);
  if (error) throw error;
  return (data ?? []) as Rating[];
}

export type CreateRatingInput = {
  bookingId: string;
  raterId: string;
  rateeId: string;
  score: number; // 1..5
  comment: string | null;
};

export type RatingBreakdown = {
  average: number;
  count: number;
  buckets: [number, number, number, number, number]; // [1★, 2★, 3★, 4★, 5★]
};

/**
 * Fetches the raw ratings for a user and returns a per-star breakdown so the
 * UI can render "how the average was reached." Uses public.ratings directly
 * (SELECT is public per RLS). Falls back to an empty breakdown on error so
 * profile pages never crash.
 */
export async function loadRatingBreakdown(userId: string): Promise<RatingBreakdown> {
  const { data, error } = await supabase
    .from('ratings')
    .select('score')
    .eq('ratee_id', userId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[ratings] loadRatingBreakdown', error.message);
    return { average: 0, count: 0, buckets: [0, 0, 0, 0, 0] };
  }
  const rows = (data ?? []) as { score: number }[];
  const buckets: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of rows) {
    const s = Math.round(r.score);
    if (s >= 1 && s <= 5) {
      buckets[s - 1] += 1;
      sum += s;
    }
  }
  const count = rows.length;
  const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  return { average, count, buckets };
}

export async function createRating(input: CreateRatingInput): Promise<Rating> {
  const { data, error } = await supabase
    .from('ratings')
    .insert({
      booking_id: input.bookingId,
      rater_id:   input.raterId,
      ratee_id:   input.rateeId,
      score:      input.score,
      comment:    input.comment,
    })
    .select('*')
    .single();
  if (error) {
    if (/duplicate key/i.test(error.message)) {
      throw new Error('You have already rated this trip.');
    }
    throw error;
  }
  // profiles.rating_avg / rating_count are refreshed by the ratings_after_write
  // trigger (SECURITY DEFINER) — no client-side aggregation needed.
  return data as Rating;
}

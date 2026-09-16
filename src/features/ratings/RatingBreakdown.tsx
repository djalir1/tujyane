import { useEffect, useState } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { loadRatingBreakdown, type RatingBreakdown as Breakdown } from './api';

/**
 * Shows the per-star breakdown that produced the user's average. The average
 * itself is computed from the same buckets in the API layer, so the number
 * always matches the bars: sum(star × count) / sum(count).
 *
 * Bars are relative to the largest bucket so the tallest bar is always full
 * width — makes single-rating profiles readable.
 */
export function RatingBreakdown({ userId }: { userId: string }) {
  const [b, setB] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void loadRatingBreakdown(userId).then((r) => { if (alive) { setB(r); setLoading(false); } });
    return () => { alive = false; };
  }, [userId]);

  if (loading || !b) {
    return (
      <Card>
        <CardTitle>Ratings</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </Card>
    );
  }

  if (b.count === 0) {
    return (
      <Card>
        <CardTitle>Ratings</CardTitle>
        <CardDescription>No ratings yet. Ratings from completed trips will show up here.</CardDescription>
      </Card>
    );
  }

  const max = Math.max(...b.buckets);
  return (
    <Card>
      <div className="flex items-baseline gap-3">
        <div>
          <CardTitle>{b.average.toFixed(1)} ★</CardTitle>
          <CardDescription>
            {b.count} rating{b.count === 1 ? '' : 's'}. Average of the individual scores below.
          </CardDescription>
        </div>
      </div>
      <div className="mt-4 space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = b.buckets[star - 1];
          const pct = max > 0 ? (n / max) * 100 : 0;
          return (
            <div key={star} className="grid grid-cols-[24px_1fr_36px] items-center gap-2">
              <span className="text-xs font-semibold text-text-muted tabular-nums text-right">{star}★</span>
              <div className="h-2 rounded-pill bg-surface-hover overflow-hidden">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${pct}%`, transition: 'width 200ms ease-out' }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums text-text text-right">{n}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

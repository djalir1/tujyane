import type { BookingStatus } from '@/features/bookings/api';

/**
 * Shared colored badge for booking status. Same palette used everywhere the
 * status appears — passenger my-trips, driver requests, driving cockpit — so
 * the colors mean the same thing across the app.
 *
 *   requested  → amber
 *   accepted   → blue
 *   boarding   → green   (aboard)
 *   in_trip    → green   (still aboard, driving)
 *   completed  → grey
 *   no_show    → red
 *   cancelled  → grey (line-through)
 *   rejected   → red-soft
 */
export function BookingStatusBadge({ status, size = 'md' }: { status: BookingStatus; size?: 'sm' | 'md' }) {
  const m = MAP[status];
  const cls = size === 'sm'
    ? 'h-5 px-2 text-[10px]'
    : 'h-6 px-2.5 text-[11px]';
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-pill font-bold uppercase tracking-wider',
        cls,
        m.bg, m.text, m.border,
      ].join(' ')}
      aria-label={`Status: ${m.label}`}
    >
      <span className={['inline-block h-1.5 w-1.5 rounded-full', m.dot].join(' ')} />
      {m.label}
    </span>
  );
}

type Entry = { label: string; bg: string; text: string; border: string; dot: string };
const MAP: Record<BookingStatus, Entry> = {
  requested: {
    label: 'Requested', bg: 'bg-warning/15', text: 'text-warning', border: 'border border-warning/30', dot: 'bg-warning',
  },
  accepted: {
    label: 'Accepted', bg: 'bg-blue-500/15', text: 'text-blue-500', border: 'border border-blue-500/30', dot: 'bg-blue-500',
  },
  boarding: {
    label: 'Aboard', bg: 'bg-brand/15', text: 'text-brand', border: 'border border-brand/30', dot: 'bg-brand',
  },
  in_trip: {
    label: 'In trip', bg: 'bg-brand/15', text: 'text-brand', border: 'border border-brand/30', dot: 'bg-brand',
  },
  completed: {
    label: 'Completed', bg: 'bg-surface-hover', text: 'text-text-muted', border: 'border border-border', dot: 'bg-text-muted',
  },
  no_show: {
    label: 'No-show', bg: 'bg-danger/15', text: 'text-danger', border: 'border border-danger/30', dot: 'bg-danger',
  },
  rejected: {
    label: 'Rejected', bg: 'bg-danger-soft', text: 'text-danger', border: 'border border-danger/30', dot: 'bg-danger',
  },
  cancelled: {
    label: 'Cancelled', bg: 'bg-surface-hover', text: 'text-text-subtle line-through', border: 'border border-border', dot: 'bg-text-subtle',
  },
};

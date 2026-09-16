import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ds/Button';
import { useToast } from '@/components/ds/Toast';
import { createRating } from './api';

type Props = {
  bookingId: string;
  raterId: string;
  rateeId: string;
  rateeName: string;
  onClose: () => void;
  onSubmitted: () => void;
};

export function RatingDialog({ bookingId, raterId, rateeId, rateeName, onClose, onSubmitted }: Props) {
  const toast = useToast();
  const [score, setScore] = useState<number>(5);
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (score < 1 || score > 5) return;
    try {
      setBusy(true);
      await createRating({
        bookingId, raterId, rateeId,
        score,
        comment: comment.trim() || null,
      });
      toast.push({ kind: 'success', title: 'Thanks!', message: `You rated ${rateeName}.` });
      onSubmitted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit rating.';
      toast.push({ kind: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Rate ${rateeName}`}
        className="relative w-full max-w-md rounded-card bg-bg-elevated border border-border shadow-elevate p-6"
      >
        <h2 className="t-h2 text-text">Rate {rateeName}</h2>
        <p className="text-sm text-text-muted mt-1">
          Your feedback helps future riders and drivers.
        </p>

        <div className="mt-5">
          <StarsInput
            value={hover ?? score}
            onHover={setHover}
            onCommit={setScore}
            ariaLabel={`Rating for ${rateeName}`}
          />
          <p className="mt-1 text-xs text-text-muted text-center">
            {(hover ?? score)} of 5
          </p>
        </div>

        <div className="mt-5">
          <label htmlFor="rating-comment" className="text-sm font-medium text-text">
            Add a comment <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="rating-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What worked well? What could be better?"
            className="mt-1.5 w-full min-h-20 rounded-field bg-surface border border-border px-3.5 py-3 text-[15px] text-text placeholder:text-text-subtle outline-none focus:border-brand focus:shadow-ring transition-[border-color,box-shadow] resize-y"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={score < 1}>Submit rating</Button>
        </div>
      </div>
    </div>
  );
}

function StarsInput({
  value, onHover, onCommit, ariaLabel,
}: {
  value: number;
  onHover: (v: number | null) => void;
  onCommit: (v: number) => void;
  ariaLabel?: string;
}) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   { onCommit(Math.min(5, value + 1)); e.preventDefault(); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') { onCommit(Math.max(1, value - 1)); e.preventDefault(); }
    if (/^[1-5]$/.test(e.key)) { onCommit(Number(e.key)); e.preventDefault(); }
  }
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseLeave={() => onHover(null)}
      className="flex items-center justify-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-field p-1"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => onHover(n)}
          onClick={() => onCommit(n)}
          className="p-1 rounded-md hover:bg-surface-hover"
        >
          <StarIcon filled={n <= value} />
        </button>
      ))}
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden
      className={filled ? 'text-warning' : 'text-text-subtle/40'}>
      <path
        d="M12 17.3l-6.2 3.3 1.2-6.9L2 8.9l6.9-1L12 1.6l3.1 6.3 6.9 1-5 4.8 1.2 6.9z"
        fill="currentColor"
      />
    </svg>
  );
}

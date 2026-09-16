import { useState } from 'react';
import { useToast } from '@/components/ds/Toast';

type Props = { code: string; label?: string };

/**
 * The passenger's headline screen. The code sits on a subtle brand tile with
 * generous spacing and tabular numerals so it reads at a glance and copies
 * with a tap.
 */
export function BoardingCodeDisplay({ code, label = 'Show this code to your driver' }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.push({ kind: 'success', message: 'Boarding code copied.' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.push({ kind: 'error', message: 'Could not copy — read it out to your driver.' });
    }
  }

  // Render each digit as its own tile so the boarding code stays laid out
  // (never overflows or crushes) at 320px, and is comfortably readable one-
  // handed on mobile. Copying the code still works via the button around the
  // whole row.
  const chars = code.split('');
  return (
    <div className="rounded-card border border-brand/30 bg-brand/10 p-4 sm:p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">{label}</p>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy boarding code"
        className="mt-3 inline-flex justify-center gap-2 sm:gap-3 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-[8px]"
      >
        {chars.map((c, i) => (
          <span
            key={i}
            className="grid place-items-center h-16 w-14 sm:h-20 sm:w-16 rounded-field bg-bg-elevated border border-brand/25 tabular-nums text-4xl sm:text-5xl font-black text-text select-all"
          >
            {c}
          </span>
        ))}
      </button>
      <div className="mt-3 text-xs text-text-muted">
        {copied ? 'Copied to clipboard.' : 'Tap the code to copy.'}
      </div>
    </div>
  );
}

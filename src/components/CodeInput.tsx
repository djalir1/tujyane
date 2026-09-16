import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from 'react';

type Props = {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: string | null;
  ariaLabel?: string;
};

/**
 * Segmented numeric input. Each box holds one digit. Auto-advances / backspaces.
 * `value` is always the joined digits (empty boxes represented by empty chars).
 */
export function CodeInput({
  length = 4,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  error,
  ariaLabel = 'Boarding code',
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const chars = padValue(value, length);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function set(idx: number, char: string) {
    const next = [...chars];
    next[idx] = char;
    const joined = next.join('').replace(/[^\d]/g, '');
    onChange(joined);
    if (joined.length === length && onComplete) onComplete(joined);
  }

  function onDigit(e: ChangeEvent<HTMLInputElement>, idx: number) {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    if (!digit) { set(idx, ''); return; }
    set(idx, digit);
    const next = refs.current[idx + 1];
    if (next) next.focus();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key === 'Backspace' && !chars[idx]) {
      const prev = refs.current[idx - 1];
      if (prev) { prev.focus(); set(idx - 1, ''); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowLeft')  { refs.current[idx - 1]?.focus(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { refs.current[idx + 1]?.focus(); e.preventDefault(); }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    if (pasted.length === length && onComplete) onComplete(pasted);
    const idx = Math.min(pasted.length, length - 1);
    refs.current[idx]?.focus();
  }

  return (
    <div>
      <div
        role="group"
        aria-label={ariaLabel}
        className="flex justify-center gap-2 sm:gap-3"
      >
        {Array.from({ length }).map((_, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            disabled={disabled}
            value={chars[i] ?? ''}
            onChange={(e) => onDigit(e, i)}
            onKeyDown={(e) => onKey(e, i)}
            onPaste={onPaste}
            onFocus={() => setFocusIdx(i)}
            onBlur={() => setFocusIdx(null)}
            aria-label={`${ariaLabel} digit ${i + 1}`}
            className={[
              // Bigger box + more padding so the digit isn't clipped on
              // narrow phones (320px). 14w * 4 + 8*3 gap = 80px reserved but
              // total 4*56+24 = 248px still fits with side gutters.
              'h-16 w-14 sm:h-20 sm:w-16 rounded-field bg-surface border text-center',
              'text-4xl sm:text-5xl font-bold tabular-nums text-text outline-none leading-none py-0',
              'transition-[box-shadow,border-color]',
              error
                ? 'border-danger focus:shadow-[0_0_0_3px_rgb(var(--danger)/0.25)]'
                : focusIdx === i
                  ? 'border-brand shadow-ring'
                  : 'border-border',
              'disabled:opacity-60',
            ].join(' ')}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger text-center">{error}</p>
      )}
    </div>
  );
}

function padValue(v: string, length: number): string[] {
  const clean = v.replace(/\D/g, '').slice(0, length);
  const arr: string[] = [];
  for (let i = 0; i < length; i++) arr.push(clean[i] ?? '');
  return arr;
}

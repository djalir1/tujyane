import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Props = {
  label: string;
  /** Value as "HH:mm" (24h). Null for empty. */
  value: string | null;
  onChange: (v: string | null) => void;
  minuteStep?: number; // default 15
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
};

export function TimePicker({
  label, value, onChange,
  minuteStep = 15, hint, error, disabled,
  placeholder = 'Pick a time', id, className = '',
}: Props) {
  const auto = useId();
  const btnId = id ?? auto;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(() => buildTimes(minuteStep), [minuteStep]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open || !value) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-t="${value}"]`);
    el?.scrollIntoView({ block: 'center' });
  }, [open, value]);

  const invalid = Boolean(error);

  return (
    <div ref={rootRef} className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={btnId} className="text-sm font-medium text-text">{label}</label>
      <button
        id={btnId}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-invalid={invalid || undefined}
        className={[
          'flex items-center justify-between h-12 px-3.5 rounded-field bg-surface border text-left transition-[box-shadow,border-color]',
          invalid ? 'border-danger focus:shadow-[0_0_0_3px_rgb(var(--danger)/0.25)]' : 'border-border focus:border-brand focus:shadow-ring',
          'text-[15px] text-text disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      >
        <span className={value ? 'text-text' : 'text-text-subtle'}>
          {value ? formatTime(value) : placeholder}
        </span>
        <ClockIcon />
      </button>

      {open && (
        <div className="relative">
          <ul
            ref={listRef}
            role="listbox"
            className="absolute z-30 mt-1 w-[min(200px,calc(100vw-2rem))] max-h-64 overflow-auto rounded-field border border-border bg-bg-elevated shadow-elevate p-1"
          >
            {options.map((t) => {
              const active = t === value;
              return (
                <li
                  key={t}
                  data-t={t}
                  role="option"
                  aria-selected={active}
                  onClick={() => { onChange(t); setOpen(false); }}
                  className={[
                    'cursor-pointer px-3 py-2 rounded-[10px] text-sm',
                    active ? 'bg-brand text-brand-fg font-semibold' : 'text-text hover:bg-surface-hover',
                  ].join(' ')}
                >
                  {formatTime(t)}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function buildTimes(step: number): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${pad(h)}:${pad(mm)}`);
  }
  return out;
}
const pad = (n: number) => n.toString().padStart(2, '0');
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className="text-text-muted">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

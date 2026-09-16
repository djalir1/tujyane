import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  hint?: ReactNode;
  error?: string | null;
  minDate?: Date;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  /** If true, past dates are disabled. Default: true. */
  disablePast?: boolean;
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Custom, mobile-friendly calendar. Never falls back to <input type="date">.
 * Tap targets are 40x40 on mobile → auto-scales with grid.
 */
export function DatePicker({
  label,
  value,
  onChange,
  hint,
  error,
  minDate,
  disabled,
  placeholder = 'Pick a date',
  id,
  className = '',
  disablePast = true,
}: Props) {
  const auto = useId();
  const btnId = id ?? auto;

  const today = useMemo(() => atMidnight(new Date()), []);
  const effectiveMin = useMemo(() => {
    if (minDate) return atMidnight(minDate);
    return disablePast ? today : null;
  }, [minDate, disablePast, today]);

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const base = value ?? today;
    return { y: base.getFullYear(), m: base.getMonth() };
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const weeks = useMemo(() => buildMonth(cursor.y, cursor.m), [cursor]);
  const invalid = Boolean(error);

  return (
    <div ref={rootRef} className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={btnId} className="text-sm font-medium text-text">{label}</label>
      <button
        id={btnId}
        type="button"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((o) => !o)}
        className={[
          'flex items-center justify-between h-12 px-3.5 rounded-field bg-surface border text-left transition-[box-shadow,border-color]',
          invalid ? 'border-danger focus:shadow-[0_0_0_3px_rgb(var(--danger)/0.25)]' : 'border-border focus:border-brand focus:shadow-ring',
          'text-[15px] text-text',
          'disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      >
        <span className={value ? 'text-text' : 'text-text-subtle'}>
          {value ? formatDate(value) : placeholder}
        </span>
        <CalendarIcon />
      </button>

      {open && (
        <div className="relative">
          <div
            role="dialog"
            aria-label="Choose a date"
            className="absolute z-30 mt-1 w-[min(320px,calc(100vw-2rem))] rounded-card border border-border bg-bg-elevated shadow-elevate p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setCursor(shiftMonth(cursor, -1))}
                aria-label="Previous month"
                className="h-9 w-9 rounded-field hover:bg-surface-hover grid place-items-center text-text-muted hover:text-text"
              >
                <Chevron dir="left" />
              </button>
              <div className="text-sm font-semibold text-text">
                {MONTH_NAMES[cursor.m]} {cursor.y}
              </div>
              <button
                type="button"
                onClick={() => setCursor(shiftMonth(cursor, +1))}
                aria-label="Next month"
                className="h-9 w-9 rounded-field hover:bg-surface-hover grid place-items-center text-text-muted hover:text-text"
              >
                <Chevron dir="right" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-[11px] font-semibold uppercase text-text-subtle text-center py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {weeks.flat().map((cell) => {
                const disabledCell = !!(effectiveMin && cell.date < effectiveMin);
                const isToday = sameDay(cell.date, today);
                const isSelected = value && sameDay(cell.date, value);
                const outMonth = cell.month !== cursor.m;
                return (
                  <button
                    key={cell.date.toISOString()}
                    type="button"
                    disabled={disabledCell}
                    onClick={() => {
                      onChange(cell.date);
                      setOpen(false);
                    }}
                    className={[
                      'aspect-square rounded-[10px] text-sm transition-colors',
                      isSelected
                        ? 'bg-brand text-brand-fg font-semibold'
                        : disabledCell
                          ? 'text-text-subtle/60 cursor-not-allowed'
                          : outMonth
                            ? 'text-text-subtle hover:bg-surface-hover'
                            : 'text-text hover:bg-surface-hover',
                      isToday && !isSelected ? 'ring-1 ring-inset ring-brand/40' : '',
                    ].join(' ')}
                    style={{ minHeight: '40px' }}
                  >
                    {cell.date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="text-xs font-medium text-text-muted hover:text-text"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = new Date();
                  onChange(atMidnight(t));
                  setOpen(false);
                }}
                className="text-xs font-semibold text-brand hover:text-brand-hover"
              >
                Today
              </button>
            </div>
          </div>
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

/* ---------- helpers ---------- */
function atMidnight(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function shiftMonth(c: { y: number; m: number }, delta: number) {
  const n = c.m + delta;
  return { y: c.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
}
function buildMonth(y: number, m: number) {
  // Grid of 6 weeks starting Monday.
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Mon=0
  const start = new Date(y, m, 1 - startOffset);
  const weeks: { date: Date; month: number }[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: { date: Date; month: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      row.push({ date: atMidnight(day), month: day.getMonth() });
    }
    weeks.push(row);
  }
  return weeks;
}
function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className="text-text-muted">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

type Props<T extends string> = {
  label: string;
  value: T | undefined;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * Custom select. Native <select> is avoided so the visual style matches
 * TextField exactly in both themes. Keyboard: Space/Enter/ArrowDown to open,
 * ArrowUp/Down to move, Enter to pick, Escape to close.
 */
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  hint,
  error,
  disabled,
  id,
  className = '',
}: Props<T>) {
  const auto = useId();
  const buttonId = id ?? auto;
  const listboxId = `${buttonId}-listbox`;

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const commit = useCallback((v: T) => { onChange(v); setOpen(false); btnRef.current?.focus(); }, [onChange]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => nextEnabled(options, i, +1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => nextEnabled(options, i, -1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[highlight];
      if (opt && !opt.disabled) commit(opt.value);
    }
  }

  const invalid = Boolean(error);

  return (
    <div ref={rootRef} className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={buttonId} className="text-sm font-medium text-text">{label}</label>
      <div className="relative">
        <button
          id={buttonId}
          ref={btnRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-invalid={invalid || undefined}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onButtonKey}
          className={[
            'flex w-full items-center justify-between h-12 px-3.5 rounded-field bg-surface border transition-[box-shadow,border-color] text-left',
            invalid
              ? 'border-danger focus:shadow-[0_0_0_3px_rgb(var(--danger)/0.25)]'
              : 'border-border focus:border-brand focus:shadow-ring',
            'text-[15px] text-text',
            'disabled:cursor-not-allowed disabled:opacity-60',
          ].join(' ')}
        >
          <span className={selected ? 'text-text' : 'text-text-subtle'}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className={open ? 'rotate-180 text-text' : 'text-text-muted'} />
        </button>

        {open && (
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onListKey}
            aria-activedescendant={`${buttonId}-opt-${highlight}`}
            autoFocus
            className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-field border border-border bg-bg-elevated shadow-elevate p-1 focus:outline-none"
          >
            {options.map((opt, idx) => {
              const active = idx === highlight;
              const isSelected = opt.value === value;
              return (
                <li
                  id={`${buttonId}-opt-${idx}`}
                  key={opt.value}
                  data-idx={idx}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => !opt.disabled && commit(opt.value)}
                  className={[
                    'rounded-[10px] px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-3',
                    opt.disabled ? 'opacity-50 cursor-not-allowed' : '',
                    active ? 'bg-surface-hover' : 'bg-transparent',
                  ].join(' ')}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-text truncate">{opt.label}</span>
                    {opt.description && (
                      <span className="block text-xs text-text-muted truncate">{opt.description}</span>
                    )}
                  </span>
                  {isSelected && <CheckIcon />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function nextEnabled<T extends string>(opts: SelectOption<T>[], from: number, dir: 1 | -1): number {
  const n = opts.length;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (!opts[i].disabled) return i;
  }
  return from;
}

function ChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className={`transition-transform ${className}`}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden className="text-brand">
      <path d="M5 12l4.5 4.5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

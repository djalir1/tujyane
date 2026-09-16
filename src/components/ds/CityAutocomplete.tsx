import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  listLocations, locationLabel, normalise, rankLocations,
  type Location, type SearchHit,
} from '@/features/locations/api';

type Props = {
  label: string;
  value: Location | null;
  onChange: (loc: Location | null) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Restrict pickable types. Default: all. */
  types?: Location['type'][];
};

/**
 * City / place selector.
 *
 * Renders like a TextField but the input is search-only — the underlying value
 * is a Location (with lat/lng) chosen from the dropdown. Data is cached in the
 * module, so filtering runs client-side.
 *
 * Search behaviour (Batch 3):
 *   - Accent/case-insensitive.
 *   - Matches against name AND aliases.
 *   - Tolerates misspellings via Levenshtein (fuzzy scaled with query length).
 *   - When no exact/prefix/substring match but fuzzy candidates exist, the
 *     dropdown header switches to "Did you mean:" so the user understands
 *     they're seeing suggestions.
 *   - Rows flagged needs_coordinates never enter the list (already excluded
 *     at the API layer).
 */
export function CityAutocomplete({
  label, value, onChange, placeholder = 'Search a city or place…',
  hint, error, disabled, id, className = '', types,
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId  = `${inputId}-list`;

  const [all, setAll] = useState<Location[]>([]);
  const [query, setQuery] = useState<string>(value ? locationLabel(value) : '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void listLocations().then((rows) => {
      if (!alive) return;
      const filtered = types ? rows.filter((r) => types.includes(r.type)) : rows;
      setAll(filtered);
    }).catch(() => {/* toast handled by caller elsewhere */});
    return () => { alive = false; };
    // types intentionally spread only if provided
  }, [types?.join('|')]);

  // Keep the input text in sync when the caller sets the value externally.
  useEffect(() => {
    if (value && locationLabel(value) !== query) setQuery(locationLabel(value));
    if (!value && query && !open) setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.id]);

  const hits: SearchHit[] = useMemo(() => rankLocations(all, query, 8), [all, query]);
  const results = hits.map((h) => h.location);

  // "Did you mean" header appears when the top match is only a fuzzy one —
  // i.e. we didn't find a clean prefix/exact/substring for what the user typed.
  const didYouMean = useMemo(() => {
    if (!query.trim()) return false;
    if (hits.length === 0) return false;
    const best = hits[0]?.match;
    return best === 'fuzzy';
  }, [hits, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const commit = useCallback((loc: Location) => {
    onChange(loc);
    setQuery(locationLabel(loc));
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(results.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { if (results[highlight]) { e.preventDefault(); commit(results[highlight]); } }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  const invalid = Boolean(error);
  const normalisedQuery = normalise(query);

  return (
    <div ref={rootRef} className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-text">{label}</label>
      <div
        className={[
          'flex items-center rounded-field h-12 px-3.5 gap-2 transition-[box-shadow,background,border-color]',
          'bg-surface border',
          invalid
            ? 'border-danger focus-within:shadow-[0_0_0_3px_rgb(var(--danger)/0.25)]'
            : 'border-border focus-within:border-brand focus-within:shadow-ring',
        ].join(' ')}
      >
        <PinIcon />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          onFocus={() => { setOpen(true); setHighlight(0); }}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            setHighlight(0);
            if (!v) onChange(null);
          }}
          onKeyDown={onKey}
          className="flex-1 min-w-0 bg-transparent outline-none border-0 p-0 text-[15px] text-text placeholder:text-text-subtle disabled:opacity-60"
        />
        {value && !disabled && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => { onChange(null); setQuery(''); setOpen(true); inputRef.current?.focus(); }}
            className="text-text-muted hover:text-text rounded-md p-1"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {open && (
        <div className="relative">
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 w-full max-h-[min(26rem,calc(100vh-14rem))] overflow-auto rounded-field border border-border bg-bg-elevated shadow-elevate p-1"
          >
            {results.length === 0 ? (
              <li className="px-3 py-3 text-sm text-text-muted">
                No place matches "{query}". Try Kigali, Musanze, Gisenyi, Huye…
              </li>
            ) : (
              <>
                {didYouMean && (
                  <li className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Did you mean:
                  </li>
                )}
                {results.map((r, i) => {
                  const active = i === highlight;
                  const hit = hits[i];
                  // Sub-areas indent slightly so users can visually parse the
                  // "part of X" grouping at a glance.
                  const indent = r.parent_id ? 'pl-7' : 'pl-3';
                  return (
                    <li
                      key={r.id}
                      role="option"
                      aria-selected={value?.id === r.id}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => commit(r)}
                      className={[
                        'flex items-center gap-2.5 pr-3 py-2.5 rounded-[10px] cursor-pointer',
                        indent,
                        active ? 'bg-surface-hover' : 'bg-transparent',
                      ].join(' ')}
                    >
                      <TypeBadge type={r.type} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-text truncate">
                          <HighlightedText text={r.name} q={normalisedQuery} />
                        </span>
                        <span className="block text-xs text-text-muted truncate">
                          {locationLabel(r).replace(new RegExp(`^${escapeRe(r.name)}\\s*(—\\s*)?`), '') || r.district || ''}
                          {hit?.match === 'alias' && r.aliases?.length > 0 && (
                            <> · also known as {r.aliases.join(', ')}</>
                          )}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </>
            )}
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

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Highlight the matched substring inside the option label. Case/accent-
 * insensitive: we work on the normalised copy for matching but slice from the
 * original string so casing stays intact.
 */
function HighlightedText({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const norm = normalise(text);
  const i = norm.indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-brand/20 text-text rounded px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function TypeBadge({ type }: { type: Location['type'] }) {
  const map: Record<Location['type'], { label: string; cls: string }> = {
    city:          { label: 'CITY',   cls: 'bg-brand/15 text-brand' },
    town:          { label: 'TOWN',   cls: 'bg-surface-hover text-text-muted' },
    area:          { label: 'AREA',   cls: 'bg-warning/15 text-warning' },
    node:          { label: 'AREA',   cls: 'bg-warning/15 text-warning' },
    stop:          { label: 'STOP',   cls: 'bg-surface-hover text-text-muted' },
    border:        { label: 'BORDER', cls: 'bg-navy/15 text-navy dark:text-text' },
    international: { label: 'INTL',   cls: 'bg-danger/15 text-danger' },
  };
  const m = map[type];
  return (
    <span className={['inline-flex items-center h-5 px-1.5 rounded-[6px] text-[10px] font-bold tracking-wider', m.cls].join(' ')}>
      {m.label}
    </span>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className="text-text-muted shrink-0">
      <path d="M12 21c-4-4-7-7.6-7-11a7 7 0 1 1 14 0c0 3.4-3 7-7 11z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

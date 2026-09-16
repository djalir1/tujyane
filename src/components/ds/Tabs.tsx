import type { ReactNode } from 'react';

export type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
};

type Props<T extends string> = {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
};

export function Tabs<T extends string>({ items, value, onChange, ariaLabel }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid gap-1 p-1 rounded-field bg-bg-elevated border border-border text-sm"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={[
              'h-10 rounded-[10px] font-semibold transition-all duration-150',
              active
                ? 'bg-surface text-text shadow-card'
                : 'text-text-muted hover:text-text',
            ].join(' ')}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

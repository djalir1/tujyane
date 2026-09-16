import type { ReactNode } from 'react';
import { useId } from 'react';

export type RadioOption<T extends string> = {
  value: T;
  label: string;
  description?: ReactNode;
};

type Props<T extends string> = {
  label: string;
  name?: string;
  value: T | undefined;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
  error?: string | null;
  columns?: 1 | 2 | 3;
};

export function RadioGroup<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  error,
  columns = 1,
}: Props<T>) {
  const auto = useId();
  const groupName = name ?? auto;

  return (
    <fieldset className="flex flex-col gap-2 min-w-0">
      <legend className="text-sm font-medium text-text">{label}</legend>
      <div
        className={[
          'grid gap-2',
          columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3',
        ].join(' ')}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={[
                'flex items-start gap-3 rounded-field border p-3.5 cursor-pointer transition-colors',
                selected
                  ? 'border-brand bg-brand/10'
                  : 'border-border bg-surface hover:bg-surface-hover',
              ].join(' ')}
            >
              <span
                aria-hidden
                className={[
                  'mt-0.5 h-4.5 w-4.5 min-w-4.5 rounded-full border grid place-items-center',
                  selected ? 'border-brand' : 'border-border-strong',
                ].join(' ')}
                style={{ height: '18px', width: '18px' }}
              >
                <span
                  className={[
                    'h-2 w-2 rounded-full bg-brand transition-transform',
                    selected ? 'scale-100' : 'scale-0',
                  ].join(' ')}
                />
              </span>
              <input
                type="radio"
                name={groupName}
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-text">{opt.label}</span>
                {opt.description && (
                  <span className="block text-xs text-text-muted mt-0.5">{opt.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </fieldset>
  );
}

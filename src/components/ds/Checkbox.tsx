import { useId } from 'react';
import type { ReactNode } from 'react';

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
};

export function Checkbox({ checked, onChange, label, description, disabled, id, name }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label
      htmlFor={inputId}
      className={[
        'inline-flex items-start gap-3 select-none',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'relative grid place-items-center h-5 w-5 rounded-[6px] border transition-colors mt-0.5 shrink-0',
          checked ? 'bg-brand border-brand' : 'bg-surface border-border-strong hover:border-text-muted',
        ].join(' ')}
      >
        <input
          id={inputId}
          name={name}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        {checked && (
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
            <path
              d="M5 10.5l3 3 7-7"
              fill="none"
              stroke="rgb(var(--brand-fg))"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-text">{label}</span>}
          {description && <span className="block text-xs text-text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

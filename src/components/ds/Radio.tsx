import { useId } from 'react';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
  id?: string;
};

export function Radio({ checked, onChange, label, description, disabled, name, value, id }: Props) {
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
          'relative grid place-items-center h-5 w-5 rounded-full border transition-colors mt-0.5 shrink-0',
          checked ? 'border-brand' : 'border-border-strong hover:border-text-muted',
        ].join(' ')}
      >
        <input
          id={inputId}
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          className={[
            'block h-2.5 w-2.5 rounded-full bg-brand transition-transform',
            checked ? 'scale-100' : 'scale-0',
          ].join(' ')}
        />
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

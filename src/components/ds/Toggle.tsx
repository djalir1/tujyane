import { useId } from 'react';

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
};

export function Toggle({ checked, onChange, label, description, disabled, id }: Props) {
  const auto = useId();
  const toggleId = id ?? auto;
  return (
    <label
      htmlFor={toggleId}
      className={[
        'inline-flex items-start gap-3 select-none',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative shrink-0 h-6 w-11 rounded-pill transition-colors duration-200',
          'border border-border',
          checked ? 'bg-brand border-brand' : 'bg-bg-elevated',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'absolute top-[2px] left-[2px] rounded-full bg-white shadow-card transition-transform duration-200',
            checked ? 'translate-x-[20px]' : 'translate-x-0',
          ].join(' ')}
          style={{ height: '18px', width: '18px' }}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-text">{label}</span>}
          {description && <span className="block text-xs text-text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

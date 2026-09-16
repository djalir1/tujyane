import { forwardRef, useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
  /** Password fields get a built-in show/hide toggle unless overridden. */
  showPasswordToggle?: boolean;
};

export const TextField = forwardRef<HTMLInputElement, BaseProps>(function TextField(
  {
    label,
    hint,
    error,
    leadingIcon,
    trailingSlot,
    id,
    className = '',
    type = 'text',
    showPasswordToggle = true,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedById = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  const invalid = Boolean(error);

  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);
  const effectiveType = isPassword && visible ? 'text' : type;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
      </label>
      <div
        className={[
          'group flex items-center rounded-field h-12 px-3.5 gap-2 transition-[box-shadow,background,border-color]',
          'bg-surface border',
          invalid
            ? 'border-danger focus-within:shadow-[0_0_0_3px_rgb(var(--danger)/0.25)]'
            : 'border-border focus-within:border-brand focus-within:shadow-ring',
        ].join(' ')}
      >
        {leadingIcon && (
          <span className="shrink-0 text-text-muted" aria-hidden>
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          aria-invalid={invalid || undefined}
          aria-describedby={describedById}
          className={[
            'flex-1 min-w-0 bg-transparent outline-none border-0 p-0',
            'text-[15px] text-text placeholder:text-text-subtle',
            'disabled:cursor-not-allowed disabled:opacity-60',
          ].join(' ')}
          {...rest}
        />
        {isPassword && showPasswordToggle ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="shrink-0 rounded-md p-1 text-text-muted hover:text-text hover:bg-surface-hover"
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : (
          trailingSlot && <span className="shrink-0" aria-hidden>{trailingSlot}</span>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor" strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M10.6 6.1A11.7 11.7 0 0 1 12 6c6.5 0 10 7 10 7a19.7 19.7 0 0 1-3.3 4.3M6.6 6.6C3.6 8.7 2 12 2 12s3.5 7 10 7a11.7 11.7 0 0 0 4.4-.9"
        stroke="currentColor" strokeWidth="1.6"
      />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

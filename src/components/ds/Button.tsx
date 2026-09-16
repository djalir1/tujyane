import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    // Solid brand green with subtle depth: 1px highlight + drop shadow, press collapses shadow.
    'bg-brand text-brand-fg shadow-card hover:bg-brand-hover active:translate-y-px active:shadow-none disabled:bg-brand/40 disabled:text-brand-fg/70',
  secondary:
    'bg-navy text-white shadow-card hover:bg-navy-hover active:translate-y-px active:shadow-none disabled:bg-navy/40 disabled:text-white/70',
  outline:
    'bg-transparent text-text border border-border-strong hover:bg-surface-hover active:translate-y-px disabled:opacity-50',
  ghost:
    'bg-transparent text-text hover:bg-surface-hover disabled:opacity-50',
  danger:
    'bg-danger text-white shadow-card hover:brightness-105 active:translate-y-px active:shadow-none disabled:opacity-60',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-field gap-1.5',
  md: 'h-11 px-4 text-[15px] rounded-field gap-2',
  lg: 'h-12 px-5 text-base rounded-field gap-2',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    fullWidth,
    className = '',
    disabled,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'group relative inline-flex items-center justify-center font-semibold select-none',
        'transition-[background,box-shadow,opacity] duration-150 ease-out-quad',
        'disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {/* Content stays mounted at full width while loading — it just fades to
          zero opacity — so the button never resizes when the spinner appears.
          The spinner is absolutely centered on top. Prevents the "trembling"
          the user reported when submitting on mobile. */}
      <span
        className="inline-flex items-center gap-2 min-w-0 transition-opacity duration-150"
        style={{ opacity: loading ? 0 : 1 }}
      >
        {leadingIcon && <span className="shrink-0" aria-hidden>{leadingIcon}</span>}
        <span className="truncate">{children}</span>
        {trailingIcon && <span className="shrink-0" aria-hidden>{trailingIcon}</span>}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <Spinner />
        </span>
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

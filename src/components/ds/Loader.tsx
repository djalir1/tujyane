import type { ReactNode } from 'react';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  label?: ReactNode;
  className?: string;
};

/**
 * Branded TUJYANE loader: three pulsing dots along a subtle road line, matching
 * the ride/journey metaphor. All colors driven from tokens.
 */
export function Loader({ size = 'md', label, className = '' }: Props) {
  const dim = size === 'sm' ? 'h-6' : size === 'lg' ? 'h-14' : 'h-10';
  return (
    <div className={['inline-flex flex-col items-center gap-2', className].join(' ')}>
      <div className={['relative flex items-center gap-1.5', dim].join(' ')} aria-hidden>
        <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulseDot [animation-delay:0ms]" />
        <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulseDot [animation-delay:150ms]" />
        <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulseDot [animation-delay:300ms]" />
      </div>
      {label && <div className="text-xs text-text-muted" role="status">{label}</div>}
    </div>
  );
}

export function FullScreenLoader({ label }: { label?: ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-bg">
      <Loader size="lg" label={label} />
    </div>
  );
}

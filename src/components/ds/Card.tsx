import type { HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLDivElement> & {
  as?: 'div' | 'section' | 'article';
  padded?: boolean;
  variant?: 'default' | 'elevated' | 'glass';
  children: ReactNode;
};

export function Card({
  as: Tag = 'div',
  padded = true,
  variant = 'default',
  className = '',
  children,
  ...rest
}: Props) {
  const variants: Record<string, string> = {
    default: 'bg-surface border border-border shadow-card',
    elevated: 'bg-bg-elevated border border-border shadow-elevate',
    // Glass is reserved for hero accents; readable in both themes.
    glass:
      'border border-white/10 bg-[rgb(var(--glass-bg)/0.55)] backdrop-blur-xl shadow-elevate',
  };
  return (
    <Tag
      className={[
        'rounded-card',
        variants[variant],
        padded ? 'p-6' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-5 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`t-h2 text-text ${className}`}>{children}</h2>;
}

export function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`mt-1 text-sm text-text-muted ${className}`}>{children}</p>;
}

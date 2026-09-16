import type { HTMLAttributes } from 'react';

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Rounded corner preset. */
  shape?: 'rect' | 'text' | 'pill' | 'circle';
  /** Fixed height, e.g. "h-4". Ignored for circle. */
  heightClass?: string;
  widthClass?: string;
};

/**
 * Fixed-dimension loading placeholder. Uses a GPU-friendly opacity pulse so
 * mobile devices don't tremor on repaint the way the old moving-gradient
 * shimmer sometimes did — the box never changes size, and only `opacity`
 * animates (composite-only, no layout, no paint of large fills).
 */
export function Skeleton({
  shape = 'rect',
  heightClass,
  widthClass,
  className = '',
  ...rest
}: Props) {
  const shapeCls = {
    rect: 'rounded-md',
    text: 'rounded',
    pill: 'rounded-pill',
    circle: 'rounded-full',
  }[shape];

  const h = heightClass ?? (shape === 'text' ? 'h-3.5' : shape === 'circle' ? 'h-10' : 'h-4');
  const w = widthClass ?? (shape === 'circle' ? 'w-10' : 'w-full');

  return (
    <div
      aria-hidden
      className={[
        'skeleton-pulse bg-surface-hover',
        shapeCls, h, w, className,
      ].join(' ')}
      {...rest}
    />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton shape="circle" />
      <div className="flex-1 space-y-2">
        <Skeleton widthClass="w-1/3" />
        <Skeleton widthClass="w-2/3" heightClass="h-3" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-card bg-surface border border-border p-5 space-y-3">
      <Skeleton widthClass="w-1/2" heightClass="h-5" />
      <Skeleton />
      <Skeleton widthClass="w-4/5" />
      <Skeleton widthClass="w-2/5" />
    </div>
  );
}

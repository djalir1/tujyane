import { Link } from 'react-router-dom';
import logoMark from '@/assets/logo-mark.jpg';

type Props = {
  className?: string;
  /** 'full' = mark + live wordmark; 'mark' = mark only (icon-style, e.g. mobile drawer). */
  layout?: 'full' | 'mark';
  /** Rendered mark height in pixels. Width auto-scales. */
  heightPx?: number;
  /** Where clicking the logo navigates. Pass `null` to render as a static mark. */
  href?: string | null;
  ariaLabel?: string;
  /** Wordmark colour override — defaults to theme text token so it flips on dark. */
  wordmarkClassName?: string;
};

/**
 * TUJYANE brand.
 *
 * The mark is a transparent PNG (no baked white background), so it reads on
 * both dark and light surfaces without a wrapper chip. The wordmark is
 * rendered as live text — that keeps it crisp at every size, correctly
 * localised, and theme-aware (unlike the original PNG whose slogan text was
 * baked in and misspelled).
 */
export function Brand({
  className = '',
  layout = 'full',
  heightPx = 36,
  href = '/',
  ariaLabel = 'TUJYANE',
  wordmarkClassName,
}: Props) {
  // Wrap the mark in a white chip so the transparent PNG stands out on the dark
  // theme (it has enough dark elements — navy border, road — to blend otherwise).
  // On the light theme the chip is nearly invisible; a thin ring keeps it defined.
  const chipPad = Math.round(heightPx * 0.14);

  const content = (
    <span
      className={['inline-flex items-center gap-2.5 shrink-0', className].join(' ')}
      style={{ height: heightPx + chipPad * 2 }}
    >
      <span
        className={[
          'inline-flex items-center justify-center rounded-[14px]',
          // A bit more presence: brighter ring, slightly bigger shadow, plus
          // a soft brand-tinted glow on dark backgrounds so the chip pops.
          'bg-white ring-1 ring-black/10',
          'shadow-[0_2px_6px_rgb(var(--shadow-color)/0.18),0_0_0_1px_rgb(255_255_255/0.04)]',
          'dark:shadow-[0_2px_8px_rgb(46_158_58/0.28),0_0_0_1px_rgb(255_255_255/0.06)]',
        ].join(' ')}
        style={{ height: heightPx + chipPad * 2, width: heightPx + chipPad * 2, padding: chipPad }}
      >
        <img
          src={logoMark}
          alt={layout === 'mark' ? ariaLabel : ''}
          style={{ height: heightPx, width: heightPx }}
          className="block select-none object-contain"
          draggable={false}
        />
      </span>
      {layout === 'full' && (
        <span
          className={[
            'font-extrabold tracking-tight leading-none',
            // Theme-aware wordmark: navy on light, white-ish on dark.
            'text-navy dark:text-text',
            // Belt-and-braces: some browsers ignore translate="no" on
            // arbitrary elements unless the class is also present. Keep both.
            'notranslate',
            wordmarkClassName ?? '',
          ].join(' ')}
          style={{ fontSize: Math.round(heightPx * 0.55) }}
          aria-hidden={undefined}
          translate="no"
        >
          TUJYANE
        </span>
      )}
    </span>
  );

  return href ? (
    <Link to={href} aria-label={ariaLabel} className="inline-flex items-center">
      {content}
    </Link>
  ) : (
    content
  );
}

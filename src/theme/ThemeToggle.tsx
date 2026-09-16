import { useTheme } from './useTheme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
      onClick={toggle}
      className={[
        'inline-flex items-center justify-center rounded-pill border border-border',
        'w-10 h-10 bg-bg-elevated hover:bg-surface-hover transition-colors',
        'text-text',
        className,
      ].join(' ')}
    >
      <span className="relative block h-5 w-5">
        <SunIcon
          className={[
            'absolute inset-0 transition-all duration-300',
            isDark ? 'opacity-0 -rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100',
          ].join(' ')}
        />
        <MoonIcon
          className={[
            'absolute inset-0 transition-all duration-300',
            isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-75',
          ].join(' ')}
        />
      </span>
    </button>
  );
}

function SunIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="12" y1="2.5" x2="12" y2="5"
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  );
}

function MoonIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none">
      <path
        d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

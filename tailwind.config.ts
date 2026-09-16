import type { Config } from 'tailwindcss';

/** Bridge Tailwind's palette to CSS variables so both themes work automatically. */
const rgb = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg:            rgb('bg'),
        'bg-elevated': rgb('bg-elevated'),
        surface:       rgb('surface'),
        'surface-hover': rgb('surface-hover'),
        border:        rgb('border'),
        'border-strong': rgb('border-strong'),
        text:          rgb('text'),
        'text-muted':  rgb('text-muted'),
        'text-subtle': rgb('text-subtle'),
        'text-inverse': rgb('text-inverse'),
        brand: {
          DEFAULT: rgb('brand'),
          hover:   rgb('brand-hover'),
          fg:      rgb('brand-fg'),
        },
        navy: {
          DEFAULT: rgb('navy'),
          hover:   rgb('navy-hover'),
        },
        success: rgb('success'),
        danger:  rgb('danger'),
        'danger-soft': rgb('danger-soft'),
        warning: rgb('warning'),
        ring: rgb('ring'),
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card:  '18px',
        field: '12px',
        pill:  '999px',
      },
      boxShadow: {
        // Semantic layered shadows built from --shadow-color (opacity via /).
        card:    '0 1px 2px rgb(var(--shadow-color) / 0.06), 0 8px 24px rgb(var(--shadow-color) / 0.08)',
        elevate: '0 12px 32px rgb(var(--shadow-color) / 0.18), 0 2px 4px rgb(var(--shadow-color) / 0.05)',
        press:   'inset 0 2px 0 rgb(var(--shadow-color) / 0.15)',
        ring:    '0 0 0 3px rgb(var(--ring) / 0.35)',
      },
      transitionTimingFunction: {
        'ease-out-quad': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      keyframes: {
        pulseDot: {
          '0%,100%': { transform: 'scale(0.6)', opacity: '0.5' },
          '50%':     { transform: 'scale(1)',   opacity: '1'   },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        drawerIn: {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
        drawerInLeft: {
          from: { transform: 'translateX(-100%)' },
          to:   { transform: 'translateX(0)' },
        },
        shimmer: {
          from: { backgroundPositionX: '-200%' },
          to:   { backgroundPositionX: '200%' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1s ease-in-out infinite',
        toastIn:  'toastIn 180ms ease-out both',
        drawerIn: 'drawerIn 220ms ease-out-quad both',
        drawerInLeft: 'drawerInLeft 220ms ease-out-quad both',
        shimmer:  'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

import { useTranslation } from 'react-i18next';
import { LANG_LABEL, SUPPORTED_LANGS, persistLang, type Lang } from '@/i18n';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language)
    ? (i18n.language as Lang)
    : 'en';

  return (
    <div
      role="group"
      aria-label="Language"
      className={[
        'inline-flex items-center rounded-pill p-1 gap-0.5',
        'bg-bg-elevated border border-border',
        className,
      ].join(' ')}
    >
      {SUPPORTED_LANGS.map((lang) => {
        const active = current === lang;
        return (
          <button
            key={lang}
            type="button"
            aria-pressed={active}
            onClick={() => persistLang(lang)}
            className={[
              'h-8 min-w-[38px] px-2 text-xs font-semibold rounded-pill transition-colors',
              active
                ? 'bg-brand text-brand-fg shadow-press'
                : 'text-text-muted hover:text-text',
            ].join(' ')}
          >
            {LANG_LABEL[lang]}
          </button>
        );
      })}
    </div>
  );
}

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import rw from './rw.json';
import fr from './fr.json';

export const SUPPORTED_LANGS = ['en', 'rw', 'fr'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const LANG_LABEL: Record<Lang, string> = { en: 'EN', rw: 'RW', fr: 'FR' };

const STORAGE_KEY = 'tujyane.lang';

function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'rw' || stored === 'fr') return stored;
  const nav = window.navigator.language?.slice(0, 2);
  if (nav === 'rw') return 'rw';
  if (nav === 'fr') return 'fr';
  return 'en';
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      rw: { translation: rw },
      fr: { translation: fr },
    },
    lng: initialLang(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export function persistLang(lang: Lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  void i18n.changeLanguage(lang);
  document.documentElement.setAttribute('lang', lang);
}

document.documentElement.setAttribute('lang', i18n.language);

export default i18n;

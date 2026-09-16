import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ds/Button';
import { Toggle } from '@/components/ds/Toggle';

type Prefs = {
  essential: true; // always on
  analytics: boolean;
  marketing: boolean;
};

const STORAGE_KEY = 'tujyane.cookie-consent';
const CHOICE_KEY = 'tujyane.cookie-consent.choice';

function readStoredChoice(): 'accepted' | 'rejected' | 'custom' | null {
  try {
    const c = localStorage.getItem(CHOICE_KEY);
    if (c === 'accepted' || c === 'rejected' || c === 'custom') return c;
  } catch { /* ignore */ }
  return null;
}

function persist(prefs: Prefs, choice: 'accepted' | 'rejected' | 'custom') {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    localStorage.setItem(CHOICE_KEY, choice);
  } catch { /* ignore */ }
}

export function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ essential: true, analytics: false, marketing: false });

  useEffect(() => {
    // Show after hydration if no prior choice.
    const id = window.requestAnimationFrame(() => {
      setVisible(readStoredChoice() === null);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    const next: Prefs = { essential: true, analytics: true, marketing: true };
    persist(next, 'accepted');
    setVisible(false);
  };
  const rejectAll = () => {
    const next: Prefs = { essential: true, analytics: false, marketing: false };
    persist(next, 'rejected');
    setVisible(false);
  };
  const savePrefs = () => {
    persist(prefs, 'custom');
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('cookie.title')}
      className="fixed inset-x-3 sm:inset-x-auto sm:right-6 bottom-4 sm:bottom-6 z-[90] sm:max-w-md"
    >
      <div className={[
        'rounded-card border border-white/10 bg-[rgb(var(--glass-bg)/0.75)] backdrop-blur-xl',
        'shadow-elevate p-5',
      ].join(' ')}>
        <div className="flex items-start gap-3">
          <span className="grid place-items-center h-9 w-9 rounded-field bg-brand/15 text-brand">
            <CookieIcon />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text">{t('cookie.title')}</h3>
            <p className="text-xs text-text-muted mt-1">{t('cookie.body')}</p>
          </div>
          <button
            aria-label="Close"
            onClick={rejectAll}
            className="shrink-0 h-8 w-8 rounded-md grid place-items-center text-text-muted hover:text-text hover:bg-surface-hover"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {showPrefs && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-text">Essential</div>
                <div className="text-xs text-text-muted">Sign-in, session, security. Always on.</div>
              </div>
              <Toggle checked disabled onChange={() => { /* locked */ }} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-text">Analytics</div>
                <div className="text-xs text-text-muted">Anonymised usage stats.</div>
              </div>
              <Toggle
                checked={prefs.analytics}
                onChange={(v) => setPrefs((p) => ({ ...p, analytics: v }))}
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-text">Marketing</div>
                <div className="text-xs text-text-muted">Occasional product news.</div>
              </div>
              <Toggle
                checked={prefs.marketing}
                onChange={(v) => setPrefs((p) => ({ ...p, marketing: v }))}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
          {!showPrefs ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowPrefs(true)}>{t('cookie.prefs')}</Button>
              <Button variant="outline" size="sm" onClick={rejectAll}>{t('cookie.reject')}</Button>
              <Button size="sm" onClick={acceptAll}>{t('cookie.accept')}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowPrefs(false)}>Back</Button>
              <Button size="sm" onClick={savePrefs}>Save preferences</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CookieIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-5-5Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <circle cx="9.5" cy="12" r="1" fill="currentColor" />
      <circle cx="14" cy="15" r="1" fill="currentColor" />
      <circle cx="13" cy="9" r="1" fill="currentColor" />
    </svg>
  );
}

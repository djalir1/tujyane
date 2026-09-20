import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/useAuth';
import { checkIsAdmin } from '@/features/admin/api';

/**
 * Auth-aware user menu. Renders a circular avatar (photo → initials fallback on
 * brand background) + first name, opens a dropdown with quick links + sign-out.
 * Keyboard: Enter/Space toggles, Escape closes, outside click closes.
 */
export function UserMenu({ className = '' }: { className?: string }) {
  const { user, profile, signOut } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const nav = useNavigate();

  // Check admin status once per user. Non-admins silently fail — the row simply
  // isn't in admin_users, and RLS on that table returns nothing.
  useEffect(() => {
    let alive = true;
    if (!user) { setIsAdmin(false); return; }
    void checkIsAdmin(user.id).then((r) => { if (alive) setIsAdmin(r.admin); });
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fullName = profile?.full_name ?? '';
  const firstName = fullName.split(/\s+/)[0] || t('nav.account');

  async function onSignOut() {
    setOpen(false);
    try {
      await signOut();
      nav('/', { replace: true });
    } catch { /* toast is optional here */ }
  }

  return (
    <div ref={rootRef} className={['relative', className].join(' ')}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={[
          'group inline-flex items-center gap-2 pl-1 pr-2.5 h-10 rounded-pill',
          'bg-bg-elevated border border-border hover:bg-surface-hover transition-colors',
        ].join(' ')}
      >
        <Avatar name={fullName} url={profile?.avatar_url ?? null} size={32} />
        <span className="hidden sm:inline max-w-[120px] truncate text-sm font-semibold text-text">
          {firstName}
        </span>
        <Chevron className={open ? 'rotate-180' : ''} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('nav.account')}
          className={[
            'absolute right-0 mt-2 w-64 z-50',
            'rounded-card border border-border bg-bg-elevated shadow-elevate',
            'p-1.5',
          ].join(' ')}
        >
          <div className="px-3 py-3 flex items-center gap-3 border-b border-border mb-1">
            <Avatar name={fullName} url={profile?.avatar_url ?? null} size={40} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text truncate">{fullName || firstName}</div>
              <div className="text-xs text-text-muted truncate">
                {roleLabelFor(profile?.role_intent, isAdmin)}
              </div>
            </div>
          </div>

          <MenuLink to="/dashboard"          onNavigate={() => setOpen(false)}>Dashboard</MenuLink>
          <MenuLink to="/dashboard/trips"    onNavigate={() => setOpen(false)}>{t('nav.trips')}</MenuLink>
          {/* Driver items are hidden for passengers and for unverified drivers.
              They only make sense — and only work — for a driver with an
              approved verification. Showing them to a passenger is confusing
              and lets them tap into pages that will just deny them. */}
          {profile?.is_verified_driver && (
            <>
              <MenuLink to="/dashboard/journeys" onNavigate={() => setOpen(false)}>{t('nav.journeys')}</MenuLink>
              <MenuLink to="/dashboard/journeys/new" onNavigate={() => setOpen(false)}>{t('nav.post')}</MenuLink>
            </>
          )}
          <MenuLink to="/dashboard/profile"  onNavigate={() => setOpen(false)}>Profile</MenuLink>

          <div className="my-1 h-px bg-border" />

          {/* "Get verified" appears only for users who declared a driver intent.
              Passengers don't need this row at all. */}
          {(profile?.role_intent === 'driver' || profile?.role_intent === 'both') && (
            <MenuLink to="/dashboard/verification" onNavigate={() => setOpen(false)}>
              {profile?.is_verified_driver ? 'Verification ✓' : 'Get verified'}
            </MenuLink>
          )}
          {isAdmin && (
            <MenuLink to="/admin" onNavigate={() => setOpen(false)}>
              Admin dashboard
            </MenuLink>
          )}

          <div className="my-1 h-px bg-border" />

          <button
            role="menuitem"
            onClick={onSignOut}
            className="w-full text-left px-3 h-10 rounded-[10px] text-sm font-semibold text-danger hover:bg-danger-soft"
          >
            {t('nav.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Label shown under the user's name in the dropdown. Mirrors the mobile
 * drawer's `roleLabelFor` so both surfaces stay consistent. Admin status
 * wins over role_intent — the header dropdown was showing "Passenger" for
 * super-admins because it only looked at role_intent and ignored the
 * separate admin_users signal.
 */
function roleLabelFor(role: string | undefined, isAdmin: boolean): string {
  if (role === 'super_admin' || isAdmin) return 'Super Admin';
  if (role === 'driver') return 'Driver';
  if (role === 'both') return 'Passenger · Driver';
  return 'Passenger';
}

function MenuLink({ to, children, onNavigate }: { to: string; children: React.ReactNode; onNavigate: () => void }) {
  return (
    <Link
      role="menuitem"
      to={to}
      onClick={onNavigate}
      className="block px-3 h-10 leading-[40px] rounded-[10px] text-sm font-medium text-text hover:bg-surface-hover"
    >
      {children}
    </Link>
  );
}

export function Avatar({
  name, url, size = 32, className = '',
}: {
  name: string;
  url: string | null;
  size?: number;
  className?: string;
}) {
  const initials =
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{ height: size, width: size }}
        className={['rounded-full object-cover border border-border', className].join(' ')}
      />
    );
  }
  return (
    <span
      style={{ height: size, width: size, fontSize: Math.round(size * 0.4) }}
      className={[
        'inline-grid place-items-center rounded-full font-bold text-white shrink-0',
        'bg-brand shadow-card',
        className,
      ].join(' ')}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden className={['transition-transform text-text-muted', className].join(' ')}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

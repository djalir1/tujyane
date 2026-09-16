import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ds/Button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { Brand } from '@/components/Brand';
import { useAuth } from '@/auth/useAuth';
import { UserMenu } from '@/components/layout/UserMenu';
import { MobileNavDrawer } from '@/components/layout/MobileNavDrawer';
import type { NavVariant } from '@/components/layout/navConfig';

/**
 * Public header. On mobile the hamburger is on the LEFT and opens a portalled
 * drawer (see MobileNavDrawer) rendered outside this header's stacking context.
 * On >=lg the drawer is hidden and the inline nav + right controls take over.
 */
export function Header() {
  const { t } = useTranslation();
  const { status, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isSuperAdmin = profile?.role_intent === 'super_admin';
  const variant: NavVariant =
    isSuperAdmin ? 'admin'
    : profile?.role_intent === 'driver' || profile?.role_intent === 'both' ? 'driver'
    : status === 'authenticated' ? 'passenger'
    : 'public';

  return (
    <>
      <header
        className={[
          'sticky top-0 z-40 border-b bg-bg/90 backdrop-blur-md transition-shadow',
          scrolled ? 'border-border shadow-elevate' : 'border-transparent',
        ].join(' ')}
      >
        <div className="mx-auto max-w-6xl px-3 sm:px-6 h-16 flex items-center gap-2 sm:gap-3">
          {/* Hamburger — LEFT — hidden at >=lg */}
          <button
            ref={triggerRef}
            type="button"
            className="lg:hidden h-10 w-10 grid place-items-center rounded-field border border-border text-text bg-bg-elevated shrink-0"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-nav-drawer"
            onClick={() => setOpen(true)}
          >
            <HamburgerIcon />
          </button>

          <Brand heightPx={42} />

          <nav className="ml-6 hidden lg:flex items-center gap-1 text-sm">
            <NavItem to="/">{t('nav.search')}</NavItem>
            {/* "Post a trip" only shown when the visitor could actually post:
                 - signed-out: linked to /auth to start the driver flow
                 - signed-in: only for verified drivers
                An unverified user tapping Post would be bounced by the
                verification gate on the destination page — hide it instead. */}
            {status !== 'authenticated' && (
              <NavItem to="/journeys/new">{t('nav.post')}</NavItem>
            )}
            {status === 'authenticated' && profile?.is_verified_driver && (
              <NavItem to="/dashboard/journeys/new">{t('nav.post')}</NavItem>
            )}
            {status === 'authenticated' && !isSuperAdmin && <NavItem to="/dashboard">{t('nav.account')}</NavItem>}
            {isSuperAdmin && <NavItem to="/admin">Admin</NavItem>}
          </nav>

          <div className="ml-auto hidden lg:flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            {status === 'authenticated' ? (
              <UserMenu />
            ) : (
              <>
                <Link to="/auth"><Button size="sm" variant="ghost">{t('nav.login')}</Button></Link>
                <Link to="/auth"><Button size="sm">{t('nav.signup')}</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Portalled to document.body so no ancestor stacking context can trap it. */}
      <MobileNavDrawer
        open={open}
        onClose={() => setOpen(false)}
        variant={variant}
        returnFocusTo={triggerRef}
      />
    </>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'px-3 h-9 rounded-field grid place-items-center font-medium transition-colors',
          isActive ? 'bg-surface text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

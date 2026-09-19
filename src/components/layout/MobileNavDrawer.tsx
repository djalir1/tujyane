import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { navGroupsFor, type NavGroup, type NavVariant, type NavLeaf } from './navConfig';
import { Brand } from '@/components/Brand';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { Button } from '@/components/ds/Button';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/layout/UserMenu';

type Props = {
  open: boolean;
  onClose: () => void;
  variant: NavVariant;
  /** Element that opened the drawer — focus returns here on close. */
  returnFocusTo: React.RefObject<HTMLElement>;
};

/**
 * Mobile navigation drawer. RENDERED VIA PORTAL to document.body so it always
 * escapes any parent stacking context — the header has backdrop-blur which
 * creates a stacking context and would trap the drawer inside otherwise.
 *
 * - Backdrop dims + blocks interaction with the page beneath (z-[1000]).
 * - Panel is a fully opaque solid surface (z-[1010]).
 * Both sit above Leaflet's default control z-index (1000) so the map does
 * not bleed through the drawer on pages that host a Leaflet map.
 * - Escape closes it, backdrop click closes it, X closes it, leaf tap closes it.
 * - Focus is trapped inside while open; on close focus returns to the caller.
 * - Body scroll is locked while open.
 */
export function MobileNavDrawer({ open, onClose, variant, returnFocusTo }: Props) {
  const { t } = useTranslation();
  const { status, profile, signOut } = useAuth();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();

  // Close on route change so navigating via NavLink from inside closes the drawer.
  const lastPathRef = useRef(location.pathname);
  useEffect(() => {
    if (open && lastPathRef.current !== location.pathname) {
      onClose();
    }
    lastPathRef.current = location.pathname;
  }, [location.pathname, open, onClose]);

  // Lock body scroll + set up Escape handler + focus trap.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && panelRef.current) {
        // Small focus trap: cycle focus inside the panel.
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);

    // Move initial focus into the drawer.
    setTimeout(() => firstFocusableRef.current?.focus(), 30);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      // Return focus to the trigger.
      returnFocusTo.current?.focus();
    };
  }, [open, onClose, returnFocusTo]);

  if (!open) return null;

  const isSignedIn = status === 'authenticated';
  const groups = navGroupsFor(variant, isSignedIn, {
    isVerifiedDriver: Boolean(profile?.is_verified_driver),
    isDriverIntent: profile?.role_intent === 'driver' || profile?.role_intent === 'both',
  });

  return createPortal(
    <>
      {/* Backdrop — z-[1000], full screen, dims content, blocks pointer.
          Must sit at or above Leaflet's control z-index (1000) so map tiles
          and controls don't leak through the dimmer. */}
      <div
        className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel — z-[1010], solid opaque surface, slides in from LEFT. */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        // Panel is a flex column with a scrollable middle. Outer aside is
        // NOT itself scrollable — otherwise the sticky-ish footer scrolls with
        // the content and clips the last nav item behind the bottom navbar.
        // The <nav> child owns the scroll, and we reserve safe-area padding
        // on the bottom footer so items above stay reachable on iOS.
        className="fixed left-0 top-0 bottom-0 z-[1010] w-[86%] max-w-sm border-r border-border shadow-elevate flex flex-col animate-drawerInLeft"
        style={{ backgroundColor: 'rgb(var(--bg-elevated))', height: '100dvh' }}
      >
        {/* Header row */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border shrink-0">
          <Brand heightPx={36} />
          <button
            ref={firstFocusableRef}
            onClick={onClose}
            aria-label="Close menu"
            className="h-10 w-10 grid place-items-center rounded-field border border-border text-text hover:bg-surface-hover"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Signed-in profile chip */}
        {isSignedIn && profile && (
          <div className="px-4 py-4 border-b border-border flex items-center gap-3">
            <Avatar name={profile.full_name} url={profile.avatar_url} size={44} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text truncate">{profile.full_name}</div>
              <div className="text-xs text-text-muted truncate capitalize">
                {roleLabelFor(profile.role_intent)}
              </div>
            </div>
          </div>
        )}

        {/* Nav groups — the only scrollable region. min-h-0 is REQUIRED so
             flex lets it shrink and its own overflow scrolls; without it the
             last nav item was pushed under the footer/bottom-nav and became
             unreachable. */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2" aria-label="Primary">
          {groups.map((g, i) => (
            <ExpandableGroup key={g.label + i} group={g} onLeafClick={onClose} />
          ))}
          {/* Buffer so the last item never hugs the footer border. */}
          <div className="h-4" aria-hidden />
        </nav>

        {/* Footer: language + theme + auth actions */}
        <div
          className="p-4 border-t border-border flex flex-col gap-3 shrink-0"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center justify-between">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          {isSignedIn ? (
            <Button variant="outline" fullWidth onClick={() => { void signOut(); onClose(); }}>
              {t('nav.signOut')}
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Link to="/auth" onClick={onClose}><Button variant="ghost" fullWidth>{t('nav.login')}</Button></Link>
              <Link to="/auth" onClick={onClose}><Button fullWidth>{t('nav.signup')}</Button></Link>
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

/* ── Expandable group with rotating chevron ─────────────────────────────── */

function ExpandableGroup({ group, onLeafClick }: { group: NavGroup; onLeafClick: () => void }) {
  const location = useLocation();
  const hasActive = group.items.some((i) => matchesRoute(i, location.pathname));
  const [expanded, setExpanded] = useState<boolean>(Boolean(group.defaultOpen) || hasActive);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={[
          'w-full flex items-center justify-between h-11 px-3 rounded-field text-left',
          'text-[11px] font-bold uppercase tracking-wider text-text-muted',
          'hover:bg-surface-hover',
        ].join(' ')}
        aria-expanded={expanded}
      >
        <span>{group.label}</span>
        <Chevron open={expanded} />
      </button>

      {expanded && (
        <ul className="mt-1 space-y-0.5" role="list">
          {group.items.map((leaf) => (
            <li key={leaf.to + leaf.label}>
              <NavLink
                to={leaf.to}
                end={leaf.end}
                onClick={onLeafClick}
                className={({ isActive }) => [
                  'flex items-center gap-3 h-11 px-3 rounded-field font-semibold transition-colors',
                  isActive ? 'bg-brand/15 text-brand' : 'text-text hover:bg-surface-hover',
                ].join(' ')}
              >
                {leaf.icon && <span aria-hidden className="shrink-0">{leaf.icon}</span>}
                <span className="truncate">{leaf.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function matchesRoute(leaf: NavLeaf, pathname: string): boolean {
  if (leaf.end) return pathname === leaf.to;
  return pathname === leaf.to || pathname.startsWith(leaf.to + '/');
}

function roleLabelFor(role: string | undefined) {
  switch (role) {
    case 'super_admin': return 'Super admin';
    case 'driver':      return 'Driver';
    case 'both':        return 'Driver + passenger';
    case 'passenger':   return 'Passenger';
    default:            return '';
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden
      style={{ transition: 'transform 200ms', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

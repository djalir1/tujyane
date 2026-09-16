import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/Brand';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { Avatar, UserMenu } from '@/components/layout/UserMenu';
import { useAuth } from '@/auth/useAuth';
import { MobileNavDrawer } from '@/components/layout/MobileNavDrawer';
import { navGroupsFor, type NavLeaf, type NavVariant } from '@/components/layout/navConfig';

const STORAGE_KEY = 'tujyane.sidebar-collapsed';

export type DashboardVariant = 'passenger' | 'driver' | 'admin';

/**
 * Role-aware dashboard shell.
 *
 * Layout rules (single source of truth — the two views never coexist):
 *   * < lg (below 1024): sidebar is HIDDEN, content is full-width, the
 *     hamburger is visible and opens the portal-rendered MobileNavDrawer.
 *   * >= lg: sidebar visible + collapsible, hamburger hidden.
 *
 * Nav items come from `navGroupsFor(variant)` so the desktop sidebar and the
 * mobile drawer render the exact same tree.
 */
export function DashboardLayout({ variant }: { variant: DashboardVariant }) {
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const groups = navGroupsFor(variant as NavVariant, true, {
    isVerifiedDriver: Boolean(profile?.is_verified_driver),
    isDriverIntent: profile?.role_intent === 'driver' || profile?.role_intent === 'both',
  });
  const allItems: NavLeaf[] = groups.flatMap((g) => g.items);
  const bottomItems = allItems.filter((it) => it.bottomNav).slice(0, 5);
  const title = useDashboardTitle();

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Desktop sidebar (>=lg only) */}
      <aside
        className={[
          'hidden lg:flex sticky top-0 h-screen border-r border-border bg-bg-elevated',
          collapsed ? 'w-[76px]' : 'w-[260px]',
          'transition-[width] duration-200 ease-out flex-col shrink-0',
        ].join(' ')}
      >
        <div className={['h-16 px-3 flex items-center border-b border-border', collapsed ? 'justify-center' : 'justify-between'].join(' ')}>
          {collapsed ? <Brand heightPx={30} layout="mark" /> : <Brand heightPx={30} />}
        </div>

        <nav className="flex-1 p-2 overflow-y-auto space-y-3" aria-label="Sidebar">
          {groups.map((g, gi) => (
            <div key={g.label + gi}>
              {!collapsed && (
                <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-subtle">
                  {g.label}
                </div>
              )}
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <SidebarItem key={it.to + it.label} item={it} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {variant === 'admin' && !collapsed && profile && (
          <div className="px-3 pb-3">
            <div className="rounded-field bg-bg border border-border px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-text-subtle">Signed in as</div>
              <div className="mt-1 flex items-center gap-2">
                <Avatar name={profile.full_name} url={profile.avatar_url} size={24} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text truncate">{profile.full_name}</div>
                  <div className="text-[10px] text-brand font-semibold">super_admin</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-2 border-t border-border">
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((c) => !c)}
            className="w-full h-10 rounded-field text-text-muted hover:bg-surface-hover flex items-center justify-center gap-2"
          >
            <ChevronsIcon flipped={collapsed} />
            {!collapsed && <span className="text-xs font-medium">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-bg/90 backdrop-blur-md border-b border-border">
          <div className="h-full px-4 sm:px-6 flex items-center gap-3">
            <button
              ref={triggerRef}
              type="button"
              className="lg:hidden h-10 w-10 grid place-items-center rounded-field border border-border text-text bg-bg-elevated"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <HamburgerIcon />
            </button>
            <div className="min-w-0">
              <div className="t-caption hidden sm:block">
                {variant === 'admin' ? 'Admin' : variant === 'driver' ? 'Driver' : t('nav.account')}
              </div>
              <h1 className="t-h3 text-text truncate">{title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden sm:block"><LanguageSwitcher /></div>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 pb-24 lg:pb-6" data-scroll-root>
          <Outlet />
        </main>
      </div>

      {/* Portal-rendered mobile drawer — same nav groups as the sidebar. */}
      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant={variant as NavVariant}
        returnFocusTo={triggerRef}
      />

      {/* Mobile bottom nav */}
      {bottomItems.length > 0 && (
        <nav
          aria-label="Quick nav"
          className={[
            'lg:hidden fixed bottom-0 inset-x-0 z-30',
            'border-t border-border bg-bg-elevated',
            'pb-[env(safe-area-inset-bottom,0)]',
          ].join(' ')}
        >
          <div className="grid" style={{ gridTemplateColumns: `repeat(${bottomItems.length}, minmax(0,1fr))` }}>
            {bottomItems.map((it) => (
              <NavLink
                key={it.to + it.label}
                to={it.to}
                end={it.end}
                className={({ isActive }) => [
                  'flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-semibold',
                  isActive ? 'text-brand' : 'text-text-muted',
                ].join(' ')}
              >
                <span className="w-6 grid place-items-center">{it.icon}</span>
                <span className="truncate max-w-full px-1">{it.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function SidebarItem({ item, collapsed }: { item: NavLeaf; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => [
        'flex items-center gap-3 h-10 rounded-field font-medium transition-colors',
        collapsed ? 'justify-center px-0' : 'px-3',
        isActive ? 'bg-brand/15 text-brand' : 'text-text-muted hover:text-text hover:bg-surface-hover',
      ].join(' ')}
    >
      <span className="w-6 grid place-items-center">{item.icon}</span>
      {!collapsed && <span className="text-sm truncate">{item.label}</span>}
    </NavLink>
  );
}

/* ── Route → title map ──────────────────────────────────────────────────── */

const TITLE_MAP: Array<[RegExp, string]> = [
  [/^\/dashboard\/journeys\/new$/,   'Post a journey'],
  [/^\/dashboard\/journeys$/,        'My journeys'],
  [/^\/dashboard\/journeys\/[^/]+\/manage$/, 'Manage bookings'],
  [/^\/dashboard\/requests/,         'Booking requests'],
  [/^\/dashboard\/driving/,          'Driving'],
  [/^\/dashboard\/earnings/,         'Earnings'],
  [/^\/dashboard\/trips/,            'My trips'],
  [/^\/dashboard\/find/,             'Find a ride'],
  [/^\/dashboard\/receipts/,         'Receipts'],
  [/^\/dashboard\/verification/,     'Verification'],
  [/^\/dashboard\/profile/,          'Profile'],
  [/^\/dashboard$/,                  'Overview'],
  [/^\/admin\/queue/,                'Verifications'],
  [/^\/admin\/users/,                'Users'],
  [/^\/admin\/drivers$/,             'Drivers'],
  [/^\/admin\/drivers\/[^/]+$/,      'Driver review'],
  [/^\/admin\/journeys/,             'Journeys'],
  [/^\/admin\/bookings/,             'Bookings'],
  [/^\/admin\/live/,                 'Live'],
  [/^\/admin\/contributions/,        'Contributions'],
  [/^\/admin\/payments/,             'Payments'],
  [/^\/admin\/audit/,                'Audit log'],
  [/^\/admin\/reports/,              'Reports'],
  [/^\/admin\/settings/,             'Settings'],
  [/^\/admin$/,                      'Admin overview'],
];

function useDashboardTitle(): string {
  const { pathname } = useLocation();
  for (const [re, title] of TITLE_MAP) if (re.test(pathname)) return title;
  return 'Dashboard';
}

/* ── Icons ──────────────────────────────────────────────────────────────── */

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
function ChevronsIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden style={{ transform: flipped ? 'rotate(180deg)' : undefined }}>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

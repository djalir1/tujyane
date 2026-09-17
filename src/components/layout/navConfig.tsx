import type { ReactNode } from 'react';

/** Single source of truth for the nav — consumed by BOTH the desktop sidebar
 * and the portal-rendered mobile drawer, so the two views can never drift. */

export type NavLeaf = {
  to: string;
  label: string;
  icon?: ReactNode;
  end?: boolean;
  bottomNav?: boolean; // shown in the small mobile bottom nav bar
};

export type NavGroup = {
  label: string;
  items: NavLeaf[];
  defaultOpen?: boolean;
};

export type NavVariant = 'public' | 'passenger' | 'driver' | 'admin';

/** Contextual flags used to filter driver-only leaves. Passengers who chose
 * "both" but aren't yet verified must NOT see driver menu items — they get
 * only the "Get verified" call-to-action once they're on the driver path. */
export type NavContext = {
  isVerifiedDriver: boolean;
  /** True when profile.role_intent is 'driver' or 'both'. */
  isDriverIntent: boolean;
};

const PUBLIC_GROUP: NavGroup = {
  label: 'Explore',
  defaultOpen: true,
  items: [
    { to: '/',       label: 'Home',         icon: <HomeIcon />, end: true },
    { to: '/search', label: 'Browse rides', icon: <SearchIcon />, bottomNav: true },
  ],
};

const PUBLIC_SIGNED_OUT_END: NavGroup = {
  label: 'Account',
  defaultOpen: true,
  items: [
    { to: '/auth', label: 'Log in',         icon: <UserIcon /> },
    { to: '/auth', label: 'Create account', icon: <PlusIcon /> },
  ],
};

const PASSENGER_GROUPS: NavGroup[] = [
  PUBLIC_GROUP,
  { label: 'You', defaultOpen: true, items: [
    { to: '/dashboard',          label: 'Overview', icon: <HomeIcon />,   end: true, bottomNav: true },
    { to: '/dashboard/trips',    label: 'My trips', icon: <TicketIcon />, bottomNav: true },
    { to: '/dashboard/receipts', label: 'Receipts', icon: <ReceiptIcon /> },
    { to: '/dashboard/profile',  label: 'Profile',  icon: <UserIcon />,   bottomNav: true },
  ]},
];

/**
 * Driver groups. Split into "core" (always visible for a driver-role user)
 * and "verified-only" (posting a trip, my journeys, requests, driving cockpit
 * and earnings — gated on `is_verified_driver`). An unverified driver only
 * sees the "Get verified" CTA — no way to try posting.
 */
function driverGroupsFor(ctx: NavContext): NavGroup[] {
  const drivingItems: NavLeaf[] = [
    { to: '/dashboard',              label: 'Overview',    icon: <HomeIcon />,  end: true, bottomNav: true },
  ];
  if (ctx.isVerifiedDriver) {
    drivingItems.push(
      { to: '/dashboard/journeys',     label: 'My journeys', icon: <RouteIcon />, bottomNav: true },
      { to: '/dashboard/journeys/new', label: 'Post a trip', icon: <PlusIcon />,  bottomNav: true },
      { to: '/dashboard/requests',     label: 'Requests',    icon: <InboxIcon /> },
      { to: '/dashboard/driving',      label: 'Driving',     icon: <WheelIcon /> },
    );
  }

  const accountItems: NavLeaf[] = [
    { to: '/dashboard/verification', label: ctx.isVerifiedDriver ? 'Verification ✓' : 'Get verified', icon: <ShieldIcon /> },
  ];
  if (ctx.isVerifiedDriver) {
    accountItems.push({ to: '/dashboard/earnings', label: 'Earnings', icon: <CashIcon /> });
    accountItems.push({ to: '/dashboard/receipts', label: 'Receipts', icon: <ReceiptIcon /> });
  }
  accountItems.push({ to: '/dashboard/profile', label: 'Profile', icon: <UserIcon />, bottomNav: true });

  // If the user is "both", they still have a passenger side — expose trips too.
  if (ctx.isDriverIntent && ctx.isVerifiedDriver) {
    return [
      PUBLIC_GROUP,
      { label: 'Driving', defaultOpen: true, items: drivingItems },
      { label: 'You',                   items: [
        { to: '/dashboard/trips',    label: 'My trips', icon: <TicketIcon />, bottomNav: true },
        { to: '/dashboard/receipts', label: 'Receipts', icon: <ReceiptIcon /> },
      ]},
      { label: 'Account',               items: accountItems },
    ];
  }

  return [
    PUBLIC_GROUP,
    { label: 'Driving', defaultOpen: true, items: drivingItems },
    { label: 'Account', items: accountItems },
  ];
}

const ADMIN_GROUPS: NavGroup[] = [
  PUBLIC_GROUP,
  { label: 'Overview', defaultOpen: true, items: [
    { to: '/admin', label: 'Overview', icon: <HomeIcon />, end: true, bottomNav: true },
  ]},
  { label: 'People', items: [
    { to: '/admin/users',   label: 'Users',         icon: <UsersIcon />, bottomNav: true },
    { to: '/admin/drivers', label: 'Drivers',       icon: <RouteIcon /> },
    { to: '/admin/queue',   label: 'Verifications', icon: <ShieldIcon />, bottomNav: true },
  ]},
  { label: 'Rides', items: [
    { to: '/admin/journeys', label: 'Journeys', icon: <PlusIcon /> },
    { to: '/admin/bookings', label: 'Bookings', icon: <TicketIcon /> },
    { to: '/admin/live',     label: 'Live',     icon: <WheelIcon /> },
  ]},
  { label: 'Money', items: [
    { to: '/admin/contributions', label: 'Contributions', icon: <CashIcon /> },
    { to: '/admin/payments',      label: 'Payments',      icon: <ReceiptIcon /> },
  ]},
  { label: 'Ops', items: [
    { to: '/admin/audit',    label: 'Audit log', icon: <InboxIcon /> },
    { to: '/admin/reports',  label: 'Reports',   icon: <ReportIcon /> },
    { to: '/admin/settings', label: 'Settings',  icon: <GearIcon /> },
  ]},
];

export function navGroupsFor(variant: NavVariant, isSignedIn: boolean, ctx?: NavContext): NavGroup[] {
  switch (variant) {
    case 'passenger': return PASSENGER_GROUPS;
    case 'driver':    return driverGroupsFor(ctx ?? { isVerifiedDriver: false, isDriverIntent: true });
    case 'admin':     return ADMIN_GROUPS;
    case 'public':
    default:
      return isSignedIn ? [PUBLIC_GROUP] : [PUBLIC_GROUP, PUBLIC_SIGNED_OUT_END];
  }
}

/* ── Icons (kept here so BOTH the sidebar and the drawer can pull from one place) ── */

export function HomeIcon()   { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
export function SearchIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75"/><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>; }
export function TicketIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7z" stroke="currentColor" strokeWidth="1.6"/><path d="M12 6v12" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 3"/></svg>; }
export function RouteIcon()  { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 6h6a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h6" stroke="currentColor" strokeWidth="1.6" fill="none"/></svg>; }
export function PlusIcon()   { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
export function InboxIcon()  { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><path d="M4 4h16v10h-5l-1 2h-4l-1-2H4V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M4 14v6h16v-6" stroke="currentColor" strokeWidth="1.6"/></svg>; }
export function WheelIcon()  { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke="currentColor" strokeWidth="1.6"/></svg>; }
export function ShieldIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>; }
export function CashIcon()   { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><rect x="3" y="7" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6"/></svg>; }
export function ReceiptIcon(){ return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><path d="M5 3h14v18l-3-2-3 2-3-2-3 2-2-2V3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
export function UserIcon()   { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
export function UsersIcon()  { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6"/><circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M3 20c1-3.5 3.5-5 6-5s5 1.5 6 5M14 20c.5-2 2.5-3.5 5-3.5s3 1 3.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
export function GearIcon()   { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M19.4 15a1 1 0 0 0 .2 1l0 0a2 2 0 0 1-2.9 2.9l-.1-.1a1 1 0 0 0-1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1 .2l-.1.1A2 2 0 0 1 5.6 16.5l.1-.1a1 1 0 0 0 .2-1 1 1 0 0 0-.9-.6H5a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1L5.7 9A2 2 0 1 1 8.6 6.1l.1.1a1 1 0 0 0 1 .2H10a1 1 0 0 0 .6-.9V5a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1-.2l.1-.1A2 2 0 1 1 19.2 8.6l-.1.1a1 1 0 0 0-.2 1V10a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>; }
export function ReportIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden><path d="M4 4h12l4 4v12H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M16 4v4h4" stroke="currentColor" strokeWidth="1.6"/><path d="M8 12v6M12 9v9M16 14v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }

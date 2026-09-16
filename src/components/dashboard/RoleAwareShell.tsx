import { Navigate } from 'react-router-dom';
import { DashboardLayout } from './DashboardLayout';
import { useAuth } from '@/auth/useAuth';
import { FullScreenLoader } from '@/components/ds/Loader';

/**
 * Picks the right dashboard variant based on the current user's role_intent.
 * Passengers get the passenger nav; drivers/both get the driver nav. Super
 * admins live at `/admin` and never see the passenger/driver dashboards, so we
 * redirect them there — the admin route shell renders <DashboardLayout
 * variant="admin"/> directly.
 *
 * If the profile hasn't hydrated yet we render the passenger shell as a safe
 * default rather than sitting on a spinner — the token is valid, the user is
 * signed in, and profile-dependent driver features (posting, verification)
 * gate themselves on `profile.is_verified_driver` internally.
 */
export function RoleAwareShell() {
  const { profile, status, authReady } = useAuth();
  if (!authReady || status === 'loading') return <FullScreenLoader label="Loading…" />;
  if (profile?.role_intent === 'super_admin') {
    return <Navigate to="/admin" replace />;
  }
  const isDriver = profile?.role_intent === 'driver' || profile?.role_intent === 'both';
  return <DashboardLayout variant={isDriver ? 'driver' : 'passenger'} />;
}

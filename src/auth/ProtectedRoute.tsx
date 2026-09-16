import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { FullScreenLoader } from '@/components/ds/Loader';

// Hard gate: redirect anon users to /auth, preserving the destination.
// Use ONLY for pages that truly require an account (posting a journey,
// requesting a ride, viewing my bookings). Browsing/search must NOT use this.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, authReady } = useAuth();
  const location = useLocation();

  // Wait for the initial auth boot to finish. authReady flips as soon as the
  // session token is known (session present or definitively absent) — before
  // profile hydration — so this can never hang.
  if (!authReady || status === 'loading') return <FullScreenLoader label="Loading…" />;

  if (status === 'anonymous') {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

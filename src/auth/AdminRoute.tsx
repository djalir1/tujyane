import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';
import { checkIsAdmin } from '@/features/admin/api';
import { FullScreenLoader } from '@/components/ds/Loader';

/**
 * Server-gated admin route.
 *
 * Never a blank error for non-admins: we silently 404-equivalent by
 * redirecting to `/`. The real gate is RLS on admin queries; this component
 * only saves users a wasted round-trip and hides the URL from casual probing.
 *
 * Behavior contract:
 *   - Wait for auth resolution (authReady) — otherwise a page refresh reads
 *     an empty in-memory session for a tick and we'd wrongly deny.
 *   - Once authenticated, check is_admin with a HARD timeout. On timeout or
 *     RPC error we retry once, then deny. We never sit on an infinite spinner.
 *   - Fast path: if profile.role_intent === 'super_admin' we skip the RPC
 *     entirely (is_admin already trusts that role since migration 0015).
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, status, authReady, profile } = useAuth();
  const [state, setState] = useState<'idle' | 'checking' | 'admin' | 'deny'>('idle');

  useEffect(() => {
    let alive = true;

    if (!authReady) { setState('checking'); return; }
    if (status === 'anonymous' || !user) { setState('deny'); return; }

    // Fast path: profile is hydrated and says super_admin — no RPC needed.
    if (profile?.role_intent === 'super_admin') { setState('admin'); return; }

    setState('checking');
    const check = async (attempt: number): Promise<void> => {
      const timeout = new Promise<{ admin: false; role: null; _timeout: true }>((resolve) =>
        setTimeout(() => resolve({ admin: false, role: null, _timeout: true }), 3500),
      );
      const result = await Promise.race([checkIsAdmin(user.id), timeout]);
      if (!alive) return;
      if (result.admin) { setState('admin'); return; }
      if ((result as { _timeout?: true })._timeout && attempt === 0) {
        // One retry on transient timeout — session mid-rotation, network blip.
        setTimeout(() => { if (alive) void check(1); }, 400);
        return;
      }
      setState('deny');
    };
    void check(0);

    return () => { alive = false; };
  }, [authReady, status, user, profile?.role_intent]);

  if (state === 'idle' || state === 'checking') return <FullScreenLoader label="Loading…" />;
  if (state === 'deny')  return <Navigate to="/" replace />;
  return <>{children}</>;
}

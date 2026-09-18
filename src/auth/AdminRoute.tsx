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
 * Behaviour contract:
 *   - Wait for auth resolution (authReady) — otherwise a page refresh reads
 *     an empty in-memory session for a tick and we'd wrongly deny.
 *   - Once authenticated, check is_admin with a HARD timeout. On timeout or
 *     RPC error we retry once, then deny. We never sit on an infinite spinner.
 *   - Fast path: if profile.role_intent === 'super_admin' we skip the RPC.
 *   - Deps track user?.id (not the user object) so a new Session identity from
 *     a token refresh doesn't re-trigger the check while another one is in
 *     flight — that used to leave the guard perpetually cancelling and remounting.
 *   - Module-level cache of admin-decision-by-uid so StrictMode remounts and
 *     tab-refocus events reuse the previous result instead of re-racing.
 */

/** Cache admin decisions by user id to survive React StrictMode remounts and
 * token-refresh renders. Keyed by uid → known verdict. */
const decisionCache = new Map<string, 'admin' | 'deny'>();

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, status, authReady, profile } = useAuth();
  const uid = user?.id ?? null;
  const initial: 'idle' | 'checking' | 'admin' | 'deny' = uid && decisionCache.has(uid)
    ? decisionCache.get(uid)!
    : 'idle';
  const [state, setState] = useState(initial);

  useEffect(() => {
    let alive = true;

    if (!authReady) { setState('checking'); return; }
    if (status === 'anonymous' || !uid) { setState('deny'); return; }

    // Fast path: profile hydrated and says super_admin — no RPC needed.
    if (profile?.role_intent === 'super_admin') {
      decisionCache.set(uid, 'admin');
      setState('admin');
      return;
    }

    // Cached verdict — skip the roundtrip.
    const cached = decisionCache.get(uid);
    if (cached) { setState(cached); return; }

    setState('checking');
    const check = async (attempt: number): Promise<void> => {
      const timeout = new Promise<{ admin: false; role: null; _timeout: true }>((resolve) =>
        setTimeout(() => resolve({ admin: false, role: null, _timeout: true }), 3500),
      );
      let result: { admin: boolean; _timeout?: true };
      try {
        result = await Promise.race([checkIsAdmin(uid), timeout]);
      } catch { result = { admin: false }; }
      if (!alive) return;
      if (result.admin) {
        decisionCache.set(uid, 'admin');
        setState('admin');
        return;
      }
      if (result._timeout && attempt === 0) {
        setTimeout(() => { if (alive) void check(1); }, 400);
        return;
      }
      decisionCache.set(uid, 'deny');
      setState('deny');
    };
    void check(0);

    return () => { alive = false; };
  }, [authReady, status, uid, profile?.role_intent]);

  if (state === 'idle' || state === 'checking') return <FullScreenLoader label="Loading…" />;
  if (state === 'deny')  return <Navigate to="/" replace />;
  return <>{children}</>;
}

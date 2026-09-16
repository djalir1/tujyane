import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { RoleIntent } from '@/lib/database.types';

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role_intent: RoleIntent;
  rating_avg: number;
  rating_count: number;
  is_verified_driver: boolean;
  is_disabled: boolean;
  force_password_reset: boolean;
};

/** Session-storage key set right before we sign out a disabled account. The
 * AuthPage reads and clears it on mount to render an "account disabled" notice. */
export const AUTH_DISABLED_FLAG = 'tj:auth_disabled';

export type SignUpInput = {
  email: string;
  password: string;
  full_name: string;
  phone: string; // already normalized to +2507XXXXXXXX
  role_intent: RoleIntent;
};

export type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  /** True once auth resolution has finished — either we have a session or we
   * know there is none. Guards should key their "wait vs redirect" on this so
   * they never hang waiting for a promise that will never resolve. */
  authReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthCtx | null>(null);

/** Hard cap on any single Supabase call we make from the auth boot path — we
 * would rather deny than hang the whole UI on a stuck request. */
const AUTH_STEP_TIMEOUT_MS = 4000;

function withTimeout<T>(p: PromiseLike<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`auth timeout: ${tag}`)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<AuthCtx['status']>('loading');
  const [authReady, setAuthReady] = useState(false);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('id, full_name, phone, avatar_url, role_intent, rating_avg, rating_count, is_verified_driver, is_disabled, force_password_reset')
          .eq('id', userId)
          .maybeSingle(),
        AUTH_STEP_TIMEOUT_MS,
        'loadProfile',
      );
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[auth] failed to load profile', error.message);
        return null;
      }
      return (data as Profile | null) ?? null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[auth] loadProfile hung/failed', err);
      return null;
    }
  }, []);

  /**
   * Apply a session update. Session is committed IMMEDIATELY so guards can
   * proceed off the token; profile hydrates asynchronously in the background.
   * This is the fix for "desktop login redirects to home / dashboard loads
   * forever / refresh signs me out": the old flow awaited profile before
   * flipping status to 'authenticated', so a slow /profiles fetch left the
   * app in 'loading' — the AdminRoute guard would then time out and redirect.
   */
  const applySession = useCallback(
    (next: Session | null) => {
      setSession(next);
      if (next?.user) {
        setStatus('authenticated');
        setAuthReady(true);
        // Fire-and-forget profile hydration. is_disabled gate happens once the
        // profile lands; until then, the UI treats the user as authenticated
        // (correct — the token IS valid).
        void loadProfile(next.user.id).then(async (p) => {
          if (!mounted.current) return;
          if (p?.is_disabled) {
            try { sessionStorage.setItem(AUTH_DISABLED_FLAG, '1'); } catch { /* ignore */ }
            await supabase.auth.signOut();
            return;
          }
          setProfile(p);
        });
      } else {
        setProfile(null);
        setStatus('anonymous');
        setAuthReady(true);
      }
    },
    [loadProfile],
  );

  useEffect(() => {
    mounted.current = true;

    // Absolute failsafe: if getSession + first onAuthStateChange both never
    // resolve (network blocked, storage broken), don't leave the whole app on
    // a spinner forever. After the timeout we declare "no session" so at
    // least the public shell renders — a subsequent auth event still upgrades.
    const failsafe = setTimeout(() => {
      if (!mounted.current) return;
      setStatus((s) => (s === 'loading' ? 'anonymous' : s));
      setAuthReady(true);
    }, AUTH_STEP_TIMEOUT_MS + 1000);

    withTimeout(supabase.auth.getSession(), AUTH_STEP_TIMEOUT_MS, 'getSession')
      .then(({ data }) => {
        if (!mounted.current) return;
        applySession(data.session);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[auth] getSession failed', err);
        if (mounted.current) {
          setStatus('anonymous');
          setAuthReady(true);
        }
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      applySession(s);
    });

    return () => {
      mounted.current = false;
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Nudge our own state immediately so the caller (AuthPage) can navigate
    // without waiting for the onAuthStateChange event to round-trip.
    if (data.session) applySession(data.session);
  }, [applySession]);

  const signUp = useCallback(async (input: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: input.full_name,
          phone: input.phone,
          role_intent: input.role_intent,
        },
      },
    });
    if (error) throw error;
    if (data.session) applySession(data.session);
    // If email confirmations are ON in Supabase Auth settings, session is null.
    return { needsEmailConfirmation: !data.session };
  }, [applySession]);

  const signOut = useCallback(async () => {
    // Clear local state FIRST so guards see 'anonymous' before any redirect
    // is chosen by the caller — protected pages then refuse immediately.
    setSession(null);
    setProfile(null);
    setStatus('anonymous');
    setAuthReady(true);

    // Wipe the persisted session key ourselves — belt and braces in case the
    // network call below fails or a stale copy under a different subkey lingers.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('tujyane.auth') || k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k));
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('tujyane.auth') || k.startsWith('sb-'))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch { /* private mode / storage disabled — ignore */ }

    // `scope: 'local'` avoids a network round-trip that can otherwise leave
    // the button spinning if the auth endpoint is slow. The session is fully
    // gone locally either way.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[auth] signOut network step failed (session already cleared locally)', err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const p = await loadProfile(session.user.id);
    setProfile(p);
  }, [session, loadProfile]);

  const value = useMemo<AuthCtx>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      status,
      authReady,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, profile, status, authReady, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

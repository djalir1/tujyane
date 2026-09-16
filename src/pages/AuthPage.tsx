import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ds/Card';
import { Tabs } from '@/components/ds/Tabs';
import { TextField } from '@/components/ds/TextField';
import { Button } from '@/components/ds/Button';
import { RadioGroup } from '@/components/ds/RadioGroup';
import { useAuth } from '@/auth/useAuth';
import { AUTH_DISABLED_FLAG } from '@/auth/AuthProvider';
import {
  normalizeRwandaPhone,
  scorePassword,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from '@/lib/validators';
import { afterErrorsRender } from '@/lib/formErrors';
import { useToast } from '@/components/ds/Toast';
import type { RoleIntent } from '@/lib/database.types';

type Mode = 'signin' | 'signup';

/**
 * Post-login landing.
 *   - If the caller had a `from` state (they were kicked to /auth from a
 *     protected page), send them back there.
 *   - Else super-admins land on /admin, all other roles on /dashboard.
 *
 * We don't wait for profile.role_intent to hydrate here — /dashboard is the
 * safe default and the RoleAwareShell will bounce super_admins to /admin the
 * moment their profile lands. Waiting for profile before navigating is what
 * left users stuck on the auth form when the /profiles fetch was slow.
 */
function computeLandingRoute(role: string | undefined, fromHint: string | null): string {
  if (fromHint && fromHint.startsWith('/') && fromHint !== '/auth') return fromHint;
  return role === 'super_admin' ? '/admin' : '/dashboard';
}

export default function AuthPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('signin');
  const nav = useNavigate();
  const location = useLocation();
  const { status, user, profile } = useAuth();

  const fromHint = useMemo<string | null>(() => {
    const state = location.state as { from?: string } | null;
    return state?.from ?? null;
  }, [location.state]);

  const [disabledNotice, setDisabledNotice] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(AUTH_DISABLED_FLAG) === '1') {
        setDisabledNotice(true);
        sessionStorage.removeItem(AUTH_DISABLED_FLAG);
      }
    } catch {}
  }, []);

  const landAndNavigate = useCallback(() => {
    // Deliberately doesn't wait for `user` state to hydrate — the sign-in flow
    // calls this right after supabase resolves, so profile/user may not have
    // propagated through React state yet. Navigate anyway; the destination
    // pages hold their own auth boundary and will render correctly.
    const to = computeLandingRoute(profile?.role_intent, fromHint);
    nav(to, { replace: true });
  }, [profile?.role_intent, fromHint, nav]);

  // Auto-redirect if already signed in when arriving at /auth. We navigate as
  // soon as the session lands — RoleAwareShell handles the super_admin bounce
  // once profile hydrates, so we don't need to block on it here.
  useEffect(() => {
    if (status === 'authenticated' && user) landAndNavigate();
  }, [status, user, profile, landAndNavigate]);

  return (
    // Top-align (not vertically centered): the sign-up form is long — with
    // vertical centering the top gets pushed above the viewport and the user
    // cannot scroll up to see it. `items-start` + top padding keeps every
    // field reachable at every viewport height.
    // Full-height container that scrolls if the form gets tall (driver signup
    // is the tallest — full name, email, phone, password + meter, role radio,
    // terms and submit). Explicit `pb-24` on mobile ensures the last field
    // isn't trapped under the mobile bottom nav on the dashboard variants.
    <div className="min-h-[calc(100vh-4rem)] w-full flex items-start justify-center px-4 sm:px-6 pt-6 sm:pt-10 pb-24 sm:pb-14 bg-bg overflow-y-auto">
      <Card className="w-full max-w-md relative">
        <CardHeader>
          <CardTitle>{t('auth.welcome')}</CardTitle>
          <CardDescription>{t('auth.welcomeSub')}</CardDescription>
        </CardHeader>

        {disabledNotice && (
          <div
            role="alert"
            className="mb-4 rounded-field border border-warning/40 bg-warning/10 p-3 text-sm text-text"
          >
            <div className="font-semibold text-warning">This account is currently paused.</div>
            <div className="text-xs mt-1 text-text-muted">
              Demo and pilot accounts have been temporarily disabled. Please create a fresh account, or contact the TUJYANE team if you believe this is a mistake.
            </div>
          </div>
        )}


        <Tabs<Mode>
          items={[
            { value: 'signin', label: t('auth.signIn') },
            { value: 'signup', label: t('auth.createAccount') },
          ]}
          value={mode}
          onChange={setMode}
          ariaLabel="Auth mode"
        />

        <div className="mt-5">
          {mode === 'signin' ? (
            <SignInForm
              onDone={() => void landAndNavigate()}
              onSwitchToSignup={() => setMode('signup')}
            />
          ) : (
            <SignUpForm
              onDone={() => void landAndNavigate()}
              onSwitchToSignin={() => setMode('signin')}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Client-side login attempt throttle. This is a first line of defence — the
 * real rate limit lives at the Supabase auth endpoint — but it protects the
 * user's browser session against casual repeat presses and gives a friendly
 * cool-down message instead of a raw 429. Counter is persisted per browser so
 * a page refresh doesn't reset it.
 */
const LOGIN_ATTEMPT_KEY = 'tj:login_attempts';
const LOGIN_LOCK_UNTIL_KEY = 'tj:login_lock_until';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 60_000; // 60 seconds

function readAttempts(): number {
  try { return Number(localStorage.getItem(LOGIN_ATTEMPT_KEY) ?? '0') || 0; } catch { return 0; }
}
function writeAttempts(n: number) {
  try { localStorage.setItem(LOGIN_ATTEMPT_KEY, String(n)); } catch { /* ignore */ }
}
function readLockUntil(): number {
  try { return Number(localStorage.getItem(LOGIN_LOCK_UNTIL_KEY) ?? '0') || 0; } catch { return 0; }
}
function writeLockUntil(ts: number) {
  try {
    if (ts <= 0) localStorage.removeItem(LOGIN_LOCK_UNTIL_KEY);
    else         localStorage.setItem(LOGIN_LOCK_UNTIL_KEY, String(ts));
  } catch { /* ignore */ }
}
function clearAttempts() { writeAttempts(0); writeLockUntil(0); }

/* ---------------- Sign In ---------------- */
function SignInForm({ onDone, onSwitchToSignup }: { onDone: () => void; onSwitchToSignup: () => void }) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number>(() => readLockUntil());
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick every second while locked so the countdown updates.
  useEffect(() => {
    if (lockedUntil <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil, now]);

  const locked = lockedUntil > now;
  const secondsLeft = locked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;

    const next: typeof errors = {};
    const em = validateEmail(email);
    if (!em.ok) next.email = em.message;
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) {
      afterErrorsRender(formRef.current, (n) => {
        if (n > 0) toast.push({ kind: 'error', message: 'Please fix the highlighted fields.' });
      });
      return;
    }

    try {
      setSubmitting(true);
      await signIn(email.trim(), password);
      clearAttempts();
      onDone();
    } catch (err) {
      const attempts = readAttempts() + 1;
      writeAttempts(attempts);
      if (attempts >= LOGIN_MAX_ATTEMPTS) {
        const until = Date.now() + LOGIN_LOCK_MS;
        writeLockUntil(until);
        setLockedUntil(until);
        setErrors({
          form: `Too many failed attempts. Please wait ${Math.ceil(LOGIN_LOCK_MS / 1000)}s and try again. (AUTH-04)`,
        });
      } else {
        const remaining = LOGIN_MAX_ATTEMPTS - attempts;
        const base = mapAuthError(err);
        setErrors({
          form: `${base} ${remaining > 0 ? `${remaining} attempt${remaining === 1 ? '' : 's'} left.` : ''}`.trim(),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (forgotOpen) {
    return <ForgotPasswordForm initialEmail={email} onBack={() => setForgotOpen(false)} />;
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <TextField
        label={t('auth.password')}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <div className="-mt-1 text-right">
        <button
          type="button"
          onClick={() => setForgotOpen(true)}
          className="text-xs font-semibold text-brand hover:underline"
        >
          Forgot password?
        </button>
      </div>
      {errors.form && (
        <p className="text-sm text-danger bg-danger-soft rounded-field px-3 py-2 border border-danger/30">
          {errors.form}
        </p>
      )}
      {locked && (
        <p className="text-sm text-warning bg-warning/10 rounded-field px-3 py-2 border border-warning/30">
          Please wait {secondsLeft}s before trying again.
        </p>
      )}
      <Button type="submit" loading={submitting} disabled={locked} fullWidth>
        {t('auth.signIn')}
      </Button>
      <p className="text-center text-sm text-text-muted">
        New to TUJYANE?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="font-semibold text-brand hover:underline"
        >
          {t('auth.createAccount')}
        </button>
      </p>
    </form>
  );
}

/* ---------------- Forgot password ---------------- */
function ForgotPasswordForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = validateEmail(email);
    if (!em.ok) { setErr(em.message); return; }
    setErr(null);
    try {
      setSubmitting(true);
      // Lazy import to keep the auth page's initial bundle small.
      const { supabase } = await import('@/lib/supabase');
      const redirectTo = `${window.location.origin}/auth`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (e2) {
      setErr(mapAuthError(e2) + ' (AUTH-03)');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-card bg-brand/10 border border-brand/25 text-text px-4 py-3 text-sm">
          If an account uses <span className="font-semibold">{email}</span>, we've sent a
          password reset link. Open the email and follow the link to set a new password.
        </div>
        <Button variant="ghost" onClick={onBack}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <div className="t-caption">Password reset</div>
        <div className="text-sm text-text-muted mt-1">
          Enter your account email and we'll send you a reset link.
        </div>
      </div>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={err ?? undefined}
      />
      <Button type="submit" loading={submitting} fullWidth>Send reset link</Button>
      <Button type="button" variant="ghost" onClick={onBack}>Back to sign in</Button>
    </form>
  );
}

/* ---------------- Sign Up ---------------- */
function SignUpForm({ onDone, onSwitchToSignin }: { onDone: () => void; onSwitchToSignin: () => void }) {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleIntent>('passenger');
  const [errors, setErrors] = useState<{
    fullName?: string; email?: string; phone?: string; password?: string; form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pwScore = scorePassword(password);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const n = validateFullName(fullName); if (!n.ok) next.fullName = n.message;
    const em = validateEmail(email);      if (!em.ok) next.email = em.message;
    const ph = validatePhone(phone);      if (!ph.ok) next.phone = ph.message;
    const pw = validatePassword(password);if (!pw.ok) next.password = pw.message;
    setErrors(next);
    if (Object.keys(next).length) {
      afterErrorsRender(formRef.current, (nInvalid) => {
        if (nInvalid > 0) toast.push({ kind: 'error', message: 'Please fix the highlighted fields.' });
      });
      return;
    }

    const normalizedPhone = normalizeRwandaPhone(phone)!;
    try {
      setSubmitting(true);
      const { needsEmailConfirmation } = await signUp({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone: normalizedPhone,
        role_intent: role,
      });
      if (needsEmailConfirmation) {
        setNotice(
          `We sent a confirmation link to ${email.trim()}. Open it to finish creating your account.`,
        );
      } else {
        onDone();
      }
    } catch (err) {
      setErrors({ form: mapAuthError(err) });
    } finally {
      setSubmitting(false);
    }
  }

  if (notice) {
    return (
      <div className="rounded-card bg-brand/10 border border-brand/25 text-text px-4 py-3 text-sm">
        {notice}
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        label={t('auth.fullName')}
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
      />
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <TextField
        label={t('auth.phone')}
        type="tel"
        placeholder="+250 78 123 4567"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        hint={t('auth.phoneHint')}
      />
      <div>
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={t('auth.passwordHint')}
        />
        <PasswordMeter score={pwScore.score} label={pwScore.hint} shown={password.length > 0} />
      </div>

      <RadioGroup<RoleIntent>
        label={t('auth.roleIntent')}
        value={role}
        onChange={setRole}
        options={[
          { value: 'passenger', label: t('auth.role.passenger'), description: t('auth.role.passengerDesc') },
          { value: 'driver',    label: t('auth.role.driver'),    description: t('auth.role.driverDesc') },
          { value: 'both',      label: t('auth.role.both'),      description: t('auth.role.bothDesc') },
        ]}
      />

      {errors.form && (
        <p className="text-sm text-danger bg-danger-soft rounded-field px-3 py-2 border border-danger/30">
          {errors.form}
        </p>
      )}
      <Button type="submit" loading={submitting} fullWidth>
        {t('auth.createAccount')}
      </Button>
      <p className="text-center text-sm text-text-muted">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignin}
          className="font-semibold text-brand hover:underline"
        >
          {t('auth.signIn')}
        </button>
      </p>
      <p className="text-xs text-text-muted">{t('auth.termsHint')}</p>
    </form>
  );
}

function PasswordMeter({
  score, label, shown,
}: { score: 0 | 1 | 2 | 3 | 4; label: string; shown: boolean }) {
  if (!shown) return null;
  const bars = [0, 1, 2, 3];
  const colorFor = (i: number) => {
    if (i >= score) return 'bg-border';
    if (score <= 1) return 'bg-danger';
    if (score === 2) return 'bg-warning';
    return 'bg-brand';
  };
  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex-1 grid grid-cols-4 gap-1">
        {bars.map((i) => (
          <span key={i} className={`h-1.5 rounded-full ${colorFor(i)}`} />
        ))}
      </div>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

function mapAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
  if (/user already registered/i.test(msg) || /already been registered/i.test(msg)) {
    return 'An account with this email already exists — log in instead.';
  }
  if (/profiles_phone_unique|duplicate key.*phone/i.test(msg)) {
    return 'An account with this phone number already exists — log in instead.';
  }
  if (/duplicate key/i.test(msg) || /already exists/i.test(msg)) {
    return 'An account with these details already exists — log in instead.';
  }
  if (/rate.?limit/i.test(msg)) return 'Too many attempts. Try again in a minute.';
  return msg;
}

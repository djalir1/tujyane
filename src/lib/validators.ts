// Client-side validation helpers. Server enforces its own via checks + RLS.

export type ValidationResult = { ok: true } | { ok: false; message: string };

// Rwandan mobile phone. Accepted forms:
//   +2507XXXXXXXX  |  2507XXXXXXXX  |  07XXXXXXXX
// Normalises to E.164 +2507XXXXXXXX. Rwandan mobile prefixes: 072/073/078/079.
export function normalizeRwandaPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, '');
  const stripped = digits.replace(/^\+/, '');

  let local: string | null = null;
  if (/^250(72|73|78|79)\d{7}$/.test(stripped)) local = stripped.slice(3);
  else if (/^0(72|73|78|79)\d{7}$/.test(stripped)) local = stripped.slice(1);
  else if (/^(72|73|78|79)\d{7}$/.test(stripped)) local = stripped;

  return local ? `+250${local}` : null;
}

export function validatePhone(raw: string): ValidationResult {
  if (!raw.trim()) return { ok: false, message: 'Phone number is required.' };
  if (!normalizeRwandaPhone(raw)) {
    return {
      ok: false,
      message: 'Enter a Rwandan number, e.g. +250 78 123 4567 or 078 123 4567.',
    };
  }
  return { ok: true };
}

export function validateEmail(raw: string): ValidationResult {
  const value = raw.trim();
  if (!value) return { ok: false, message: 'Email is required.' };
  // Pragmatic check: one @, dot in domain, no spaces.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { ok: false, message: 'That doesn’t look like a valid email.' };
  }
  return { ok: true };
}

export type PasswordScore = 0 | 1 | 2 | 3 | 4;
export function scorePassword(pw: string): { score: PasswordScore; hint: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  const score = Math.min(s, 4) as PasswordScore;
  const hints = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, hint: hints[score] };
}

export function validatePassword(pw: string): ValidationResult {
  if (pw.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
  return { ok: true };
}

export function validateFullName(raw: string): ValidationResult {
  const v = raw.trim();
  if (v.length < 2) return { ok: false, message: 'Please enter your full name.' };
  if (v.length > 80) return { ok: false, message: 'That name is too long.' };
  return { ok: true };
}

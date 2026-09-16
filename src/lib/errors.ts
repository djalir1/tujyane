/**
 * Central error mapper for user-facing messages.
 *
 * The rule: nothing raw from Supabase, PostgREST, or a network stack should
 * ever surface to a user. If a match here doesn't fire, we fall back to a
 * generic "Something went wrong" line and append a short code so support can
 * correlate reports without exposing a stack trace.
 *
 *   AUTH-01 — invalid credentials
 *   AUTH-02 — email/phone/account already exists
 *   AUTH-03 — password reset flow
 *   AUTH-04 — login attempt lockout (client-side)
 *   AUTH-05 — rate limited by Supabase
 *   DB-01   — driver not verified
 *   DB-02   — vehicle not verified
 *   NET-01  — network / offline
 *   APP-01  — generic fallback
 */

export type FriendlyError = { message: string; code: string };

function raw(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return err.message ?? '';
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export function friendly(err: unknown): FriendlyError {
  const m = raw(err);

  // Network / offline. Fetch failures usually surface as TypeError.
  if (/network|failed to fetch|fetch (?:aborted|failed)|networkerror|typeerror.*fetch/i.test(m)) {
    return { code: 'NET-01', message: "We couldn't reach the network. Check your connection and try again." };
  }

  // Auth
  if (/invalid login credentials/i.test(m)) {
    return { code: 'AUTH-01', message: 'Email or password is incorrect.' };
  }
  if (/user already registered|already been registered|profiles_phone_unique|duplicate key.*phone/i.test(m)) {
    return { code: 'AUTH-02', message: 'An account with these details already exists — log in instead.' };
  }
  if (/rate.?limit/i.test(m)) {
    return { code: 'AUTH-05', message: 'Too many attempts. Please wait a minute and try again.' };
  }

  // DB integrity gates from migration 0016.
  if (/driver_not_verified/i.test(m)) {
    return { code: 'DB-01', message: 'You need to be a verified driver before posting a journey.' };
  }
  if (/vehicle_not_verified/i.test(m)) {
    return { code: 'DB-02', message: 'This vehicle is still pending verification. It can be used once approved.' };
  }
  if (/vehicle_owner_mismatch/i.test(m)) {
    return { code: 'DB-02', message: 'That vehicle does not belong to your account.' };
  }
  if (/vehicle_required/i.test(m)) {
    return { code: 'DB-02', message: 'Pick which vehicle you will drive for this journey.' };
  }
  if (/role_intent_super_admin_forbidden|is_verified_driver_forbidden|vehicle_verify_forbidden/i.test(m)) {
    return { code: 'DB-01', message: "That change isn't allowed for your account." };
  }

  // Contribution band from migration 0012 + bus-fare cap from 0020.
  if (/contribution_below_band/i.test(m)) {
    return { code: 'APP-01', message: 'That contribution is below the allowed range for this route.' };
  }
  if (/contribution_above_band/i.test(m)) {
    return { code: 'APP-01', message: 'That contribution is above the allowed range for this route.' };
  }
  if (/contribution_above_bus_fare/i.test(m)) {
    return { code: 'APP-01', message: 'That contribution is higher than the bus fare on this route — TUJYANE must stay cheaper than the bus.' };
  }
  if (/departure_in_past/i.test(m)) {
    return { code: 'APP-01', message: 'Departure must be in the future.' };
  }
  if (/seats_over_capacity/i.test(m)) {
    return { code: 'APP-01', message: 'Seats exceed the car’s capacity.' };
  }
  if (/vehicle_already_on_active_trip/i.test(m)) {
    return { code: 'APP-01', message: 'That car is already on another active trip.' };
  }
  if (/trip_not_yet_startable/i.test(m)) {
    return { code: 'APP-01', message: 'Departure hasn’t arrived yet. You can start the trip at or after the scheduled time.' };
  }

  // Generic fallback — never expose the raw text.
  return {
    code: 'APP-01',
    message: 'Something went wrong. Please try again.',
  };
}

/** Convenience for callers that just want the string ready-to-show. */
export function friendlyText(err: unknown): string {
  const f = friendly(err);
  return `${f.message} (${f.code})`;
}

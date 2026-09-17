import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { TextField } from '@/components/ds/TextField';
import { Button } from '@/components/ds/Button';
import { useToast } from '@/components/ds/Toast';
import { Avatar } from '@/components/layout/UserMenu';
import { useAuth } from '@/auth/useAuth';
import { normalizeMaybePhone, updateProfile, uploadAvatar } from '@/features/profile/api';
import { RatingBreakdown } from '@/features/ratings/RatingBreakdown';
import { validateFullName, validatePhone } from '@/lib/validators';

/** Hard cap on the save request so a stuck network can't leave the button
 * spinning forever. Matches the auth-layer timeout convention. */
const SAVE_TIMEOUT_MS = 8000;
function withTimeout<T>(p: PromiseLike<T>, ms: number, tag: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${tag}`)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string; form?: string }>({});
  const [uploading, setUploading] = useState(false);

  const isPassenger = profile?.role_intent === 'passenger';

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const next: typeof errors = {};
    const n = validateFullName(fullName);
    if (!n.ok) next.full_name = n.message;
    if (phone.trim()) {
      const p = validatePhone(phone);
      if (!p.ok) next.phone = p.message;
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    try {
      setSaving(true);
      // NOTE: role_intent is NOT sent from this form. Account type is fixed at
      // signup; a passenger who wants to become a driver goes through the
      // verification flow, not a silent flip here. Hardened by the DB trigger
      // guard_profile_role_intent (0016) — but keeping it off the wire is the
      // clearest signal too. Wrapped in a timeout so the button never spins
      // forever if the network hangs (the user reported that bug).
      await withTimeout(
        updateProfile(user.id, {
          full_name: fullName,
          phone: normalizeMaybePhone(phone),
        }),
        SAVE_TIMEOUT_MS,
        'updateProfile',
      );
      await refreshProfile();
      toast.push({ kind: 'success', message: 'Profile saved.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save.';
      setErrors({ form: msg });
      toast.push({ kind: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar(file: File) {
    if (!user) return;
    try {
      setUploading(true);
      const url = await withTimeout(uploadAvatar(user.id, file), SAVE_TIMEOUT_MS, 'uploadAvatar');
      await withTimeout(updateProfile(user.id, { avatar_url: url }), SAVE_TIMEOUT_MS, 'saveAvatar');
      await refreshProfile();
      toast.push({ kind: 'success', message: 'Avatar updated.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not upload avatar.';
      toast.push({ kind: 'error', message: msg });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url ?? null} size={72} />
          <div className="flex-1 min-w-0">
            <CardTitle>{profile?.full_name || 'Your profile'}</CardTitle>
            <CardDescription>
              {profile?.rating_count
                ? `★ ${profile.rating_avg.toFixed(1)} — ${profile.rating_count} rating${profile.rating_count > 1 ? 's' : ''}`
                : 'No ratings yet.'}
            </CardDescription>
          </div>
          <div className="shrink-0">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickAvatar(f);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
            <Button size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              Change photo
            </Button>
          </div>
        </div>
      </Card>

      {user && <RatingBreakdown userId={user.id} />}

      <form onSubmit={onSave} className="grid gap-4" noValidate>
        <Card>
          <CardTitle>Basic info</CardTitle>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={errors.full_name}
            />
            <TextField
              label="Phone"
              type="tel"
              placeholder="+250 78 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={errors.phone}
              hint="Optional — used for boarding coordination."
            />
          </div>
        </Card>

        {/* Role switcher removed. Account type is set at signup and cannot be
            silently flipped from settings. If a passenger wants to drive they
            take the deliberate "Become a driver" path through verification. */}
        {isPassenger && (
          <Card>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <CardTitle>Want to drive with TUJYANE?</CardTitle>
                <CardDescription>
                  Passengers can become drivers by going through document verification. Approval is required before you can post trips.
                </CardDescription>
              </div>
              <Link to="/dashboard/verification">
                <Button size="sm" variant="outline">Become a driver</Button>
              </Link>
            </div>
          </Card>
        )}

        {errors.form && (
          <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-field px-3 py-2">
            {errors.form}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>Save changes</Button>
        </div>
      </form>
    </div>
  );
}

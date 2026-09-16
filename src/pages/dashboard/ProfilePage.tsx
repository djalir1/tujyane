import { useRef, useState } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { TextField } from '@/components/ds/TextField';
import { Button } from '@/components/ds/Button';
import { RadioGroup } from '@/components/ds/RadioGroup';
import { useToast } from '@/components/ds/Toast';
import { Avatar } from '@/components/layout/UserMenu';
import { useAuth } from '@/auth/useAuth';
import { normalizeMaybePhone, updateProfile, uploadAvatar } from '@/features/profile/api';
import { RatingBreakdown } from '@/features/ratings/RatingBreakdown';
import type { RoleIntent } from '@/lib/database.types';
import { validateFullName, validatePhone } from '@/lib/validators';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [role, setRole] = useState<RoleIntent>(profile?.role_intent ?? 'passenger');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string; form?: string }>({});
  const [uploading, setUploading] = useState(false);

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
      await updateProfile(user.id, {
        full_name: fullName,
        phone: normalizeMaybePhone(phone),
        role_intent: role,
      });
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
      const url = await uploadAvatar(user.id, file);
      await updateProfile(user.id, {
        full_name: profile?.full_name ?? fullName,
        phone: profile?.phone ?? null,
        role_intent: profile?.role_intent ?? role,
        avatar_url: url,
      });
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
        <div className="flex items-center gap-4">
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

        <Card>
          <CardTitle>How you use TUJYANE</CardTitle>
          <div className="mt-4">
            <RadioGroup<RoleIntent>
              label="I mostly use TUJYANE as"
              value={role}
              onChange={setRole}
              options={[
                { value: 'passenger', label: 'Passenger', description: 'Find and book rides' },
                { value: 'driver',    label: 'Driver',    description: 'Offer seats on my trips' },
                { value: 'both',      label: 'Both',      description: 'Some days I drive, some I ride' },
              ]}
              columns={3}
            />
          </div>
        </Card>

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

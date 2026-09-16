import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ds/Button';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';
import { TextField } from '@/components/ds/TextField';
import { Select } from '@/components/ds/Select';
import { Tabs } from '@/components/ds/Tabs';
import { RadioGroup } from '@/components/ds/RadioGroup';
import { Toggle } from '@/components/ds/Toggle';
import { Checkbox } from '@/components/ds/Checkbox';
import { Radio } from '@/components/ds/Radio';
import { DatePicker } from '@/components/ds/DatePicker';
import { TimePicker } from '@/components/ds/TimePicker';
import { Loader } from '@/components/ds/Loader';
import { Skeleton, SkeletonCard, SkeletonRow } from '@/components/ds/Skeleton';
import { useToast } from '@/components/ds/Toast';

export default function StyleguidePage() {
  const { t } = useTranslation();
  const toast = useToast();

  const [tab, setTab] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [role, setRole] = useState<'passenger' | 'driver' | 'both'>('passenger');
  const [seats, setSeats] = useState<'1' | '2' | '3' | '4' | undefined>(undefined);
  const [luggage, setLuggage] = useState(true);
  const [pets, setPets] = useState(false);
  const [pickR, setPickR] = useState<'a' | 'b'>('a');
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-14">
      <header className="space-y-2">
        <h1 className="t-display text-text">{t('styleguide.title')}</h1>
        <p className="text-text-muted max-w-2xl">{t('styleguide.subtitle')}</p>
      </header>

      {/* Type scale */}
      <Section title="Typography" caption="Type scale">
        <div className="space-y-3">
          <div className="t-display text-text">Display · TUJYANE</div>
          <div className="t-h1 text-text">H1 · Post a trip in one minute</div>
          <div className="t-h2 text-text">H2 · Journeys near you</div>
          <div className="t-h3 text-text">H3 · Section heading</div>
          <div className="t-body text-text">Body · Share the ride, share the cost.</div>
          <div className="t-small text-text-muted">Small · used for helper copy under fields.</div>
          <div className="t-caption text-text-muted">Caption · uppercase micro label</div>
        </div>
      </Section>

      {/* Colors */}
      <Section title="Tokens" caption="Semantic surfaces">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TOKEN_SWATCHES.map(({ swatchCls, label, cls }) => (
            <div key={cls} className="rounded-card border border-border overflow-hidden">
              <div className={`h-14 ${swatchCls}`} />
              <div className="p-3 text-xs">
                <div className="font-semibold text-text">{label}</div>
                <div className="text-text-muted">{cls}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Button" caption="Variants · sizes · states">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary (navy)</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 mt-4">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      {/* Text fields */}
      <Section title="TextField" caption="Inputs with icons, hints, errors, password toggle">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Email" placeholder="you@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            label="Email (error state)"
            type="email"
            value=""
            onChange={() => { /* demo */ }}
            error="That doesn’t look like a valid email."
          />
          <TextField
            label="Password"
            type="password"
            placeholder="At least 8 chars"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            hint="Show/hide toggle built in."
          />
          <TextField
            label="Search"
            placeholder="Kigali → Musanze"
            leadingIcon={<SearchIcon />}
            onBlur={() => setEmailErr(email && !email.includes('@') ? 'Missing @' : null)}
            error={emailErr}
          />
          <TextField label="Phone" type="tel" placeholder="+250 78 123 4567" hint="Rwandan format" />
          <TextField label="Disabled" disabled value="Locked value" onChange={() => { /* noop */ }} />
        </div>
      </Section>

      {/* Select */}
      <Section title="Select" caption="Custom-styled dropdown">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Seats booked"
            value={seats}
            onChange={setSeats}
            placeholder="Choose seats"
            options={[
              { value: '1', label: '1 seat' },
              { value: '2', label: '2 seats' },
              { value: '3', label: '3 seats' },
              { value: '4', label: '4 seats', disabled: true, description: 'Not available' },
            ]}
          />
          <Select
            label="Vehicle energy"
            value={undefined}
            onChange={() => { /* demo */ }}
            placeholder="Select energy type"
            options={[
              { value: 'petrol', label: 'Petrol' },
              { value: 'diesel', label: 'Diesel' },
              { value: 'hybrid', label: 'Hybrid', description: 'Recommended' },
              { value: 'electric', label: 'Electric' },
            ]}
          />
        </div>
      </Section>

      {/* Date + Time */}
      <Section title="Date & time" caption="No native inputs">
        <div className="grid gap-4 md:grid-cols-2">
          <DatePicker label="Departure date" value={date} onChange={setDate} />
          <TimePicker label="Departure time" value={time} onChange={setTime} />
        </div>
      </Section>

      {/* Toggles / checkbox / radio */}
      <Section title="Toggle · Checkbox · Radio" caption="Controls">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardTitle>Toggle</CardTitle>
            <div className="mt-4 flex flex-col gap-3">
              <Toggle checked={pets} onChange={setPets} label="Pets allowed" description="Some drivers welcome pets." />
              <Toggle checked={luggage} onChange={setLuggage} label="Luggage allowed" />
              <Toggle checked disabled onChange={() => { /* demo */ }} label="Disabled on" />
            </div>
          </Card>
          <Card>
            <CardTitle>Checkbox</CardTitle>
            <div className="mt-4 flex flex-col gap-3">
              <Checkbox checked={pets} onChange={setPets} label="Pets allowed" />
              <Checkbox checked onChange={() => { /* demo */ }} label="Terms accepted" description="Community rules" />
              <Checkbox checked={false} onChange={() => { /* demo */ }} disabled label="Disabled" />
            </div>
          </Card>
          <Card>
            <CardTitle>Single Radio</CardTitle>
            <div className="mt-4 flex flex-col gap-3">
              <Radio checked={pickR === 'a'} onChange={() => setPickR('a')} name="pr" label="Meet at station" />
              <Radio checked={pickR === 'b'} onChange={() => setPickR('b')} name="pr" label="Pick up at home" />
            </div>
          </Card>
        </div>

        <div className="mt-4">
          <RadioGroup<'passenger' | 'driver' | 'both'>
            label="I want to use TUJYANE as"
            value={role}
            onChange={setRole}
            columns={3}
            options={[
              { value: 'passenger', label: 'Passenger', description: 'Find and book rides' },
              { value: 'driver', label: 'Driver', description: 'Offer seats on my trips' },
              { value: 'both', label: 'Both', description: 'Some days I drive, some I ride' },
            ]}
          />
        </div>
      </Section>

      {/* Tabs */}
      <Section title="Tabs" caption="Segmented control">
        <Tabs
          items={[{ value: 'sign-in', label: 'Sign in' }, { value: 'sign-up', label: 'Create account' }]}
          value={tab}
          onChange={setTab}
          ariaLabel="Demo tabs"
        />
        <p className="text-sm text-text-muted mt-2">Selected: {tab}</p>
      </Section>

      {/* Card variants */}
      <Section title="Card" caption="Default · Elevated · Glass">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardTitle>Default card</CardTitle>
            <CardDescription>Base surface used across the app.</CardDescription>
          </Card>
          <Card variant="elevated">
            <CardTitle>Elevated card</CardTitle>
            <CardDescription>For modals, drawers, popovers.</CardDescription>
          </Card>
          <Card variant="glass">
            <CardTitle>Glass card</CardTitle>
            <CardDescription>Reserved for hero banners.</CardDescription>
          </Card>
        </div>
      </Section>

      {/* Loader & skeleton */}
      <Section title="Loading" caption="Loader · Skeletons">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle>Loader</CardTitle>
            <div className="mt-4 flex items-center gap-6">
              <Loader size="sm" />
              <Loader size="md" label="Loading…" />
              <Loader size="lg" />
            </div>
          </Card>
          <Card>
            <CardTitle>Skeletons</CardTitle>
            <div className="mt-4 space-y-4">
              <SkeletonRow />
              <SkeletonCard />
              <div className="flex gap-2">
                <Skeleton shape="pill" widthClass="w-16" heightClass="h-6" />
                <Skeleton shape="pill" widthClass="w-20" heightClass="h-6" />
                <Skeleton shape="pill" widthClass="w-14" heightClass="h-6" />
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* Toasts */}
      <Section title="Toasts" caption="Feedback system">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => toast.push({ kind: 'success', title: 'Trip posted', message: t('toasts.sample.success') })}>
            Success
          </Button>
          <Button variant="danger" onClick={() => toast.push({ kind: 'error', title: 'Uh oh', message: t('toasts.sample.error') })}>
            Error
          </Button>
          <Button variant="outline" onClick={() => toast.push({ kind: 'info', message: t('toasts.sample.info') })}>
            Info
          </Button>
          <Button variant="secondary" onClick={() => toast.push({ kind: 'warning', title: 'Heads up', message: 'Something might need your attention.' })}>
            Warning
          </Button>
        </div>
      </Section>

      <footer className="border-t border-border pt-6 text-xs text-text-subtle">
        Every component reads from CSS variable tokens. Toggle themes with the icon in the header.
      </footer>
    </div>
  );
}

function Section({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        {caption && <div className="t-caption">{caption}</div>}
        <h2 className="t-h1 text-text mt-1">{title}</h2>
      </div>
      {children}
    </section>
  );
}

const TOKEN_SWATCHES: { swatchCls: string; label: string; cls: string }[] = [
  { swatchCls: 'bg-bg',            label: 'Base background',   cls: 'bg-bg' },
  { swatchCls: 'bg-bg-elevated',   label: 'Elevated surface',  cls: 'bg-bg-elevated' },
  { swatchCls: 'bg-surface',       label: 'Card surface',      cls: 'bg-surface' },
  { swatchCls: 'bg-surface-hover', label: 'Hover surface',     cls: 'bg-surface-hover' },
  { swatchCls: 'bg-border',        label: 'Border',            cls: 'bg-border' },
  { swatchCls: 'bg-brand',         label: 'Brand · #2E9E3A',   cls: 'bg-brand' },
  { swatchCls: 'bg-navy',          label: 'Navy · #16305B',    cls: 'bg-navy' },
  { swatchCls: 'bg-danger',        label: 'Danger',            cls: 'bg-danger' },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

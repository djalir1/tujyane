import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TextField } from '@/components/ds/TextField';
import { DatePicker } from '@/components/ds/DatePicker';
import { Button } from '@/components/ds/Button';
import { CityAutocomplete } from '@/components/ds/CityAutocomplete';
import { Brand } from '@/components/Brand';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/auth/useAuth';
import type { Location } from '@/features/locations/api';

const TODAY = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

export default function SearchPage() {
  return (
    <div className="bg-bg">
      <Hero />
      <HowItWorks />
      <PopularCorridors />
      <Trust />
      <DriveStrip />
      <Footer />
    </div>
  );
}

/* ─── HERO + SEARCH ────────────────────────────────────────────────────── */

function Hero() {
  const { t } = useTranslation();
  const nav = useNavigate();

  const [from, setFrom] = useState<Location | null>(null);
  const [to, setTo] = useState<Location | null>(null);
  const [date, setDate] = useState<Date | null>(TODAY());
  const [pax, setPax] = useState('1');
  const [attempted, setAttempted] = useState(false);

  const paxNum = useMemo(() => {
    const n = Number(pax);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }, [pax]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!from || !to) return;
    const params = new URLSearchParams();
    params.set('from', from.id);
    params.set('to', to.id);
    if (date) params.set('date', date.toISOString().slice(0, 10));
    if (paxNum !== 1) params.set('pax', String(paxNum));
    nav(`/search?${params.toString()}`);
  }

  return (
    <section className="relative overflow-hidden bg-navy text-white">
      {/* Layered background: two radial glows + a Rwandan-hills silhouette
          SVG at the bottom. Everything vector, no external asset, no theme
          bleed. Content sits on top with generous z-index. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(1100px 380px at 88% -12%, rgb(46 158 58 / 0.55), transparent 62%),' +
            'radial-gradient(900px 300px at -10% 120%, rgb(21 88 202 / 0.55), transparent 62%),' +
            'linear-gradient(180deg, rgb(11 30 64 / 0) 0%, rgb(6 18 42 / 0.5) 100%)',
        }}
      />
      <svg
        aria-hidden
        viewBox="0 0 1200 240" preserveAspectRatio="none"
        className="absolute left-0 right-0 bottom-0 w-full h-40 sm:h-48 opacity-40 pointer-events-none"
      >
        <path d="M0 200 L60 170 L140 190 L220 140 L320 180 L410 120 L520 170 L620 130 L720 180 L820 140 L920 190 L1020 150 L1120 180 L1200 160 L1200 240 L0 240 Z" fill="#0b3d2b" />
        <path d="M0 220 L80 190 L180 210 L260 170 L360 200 L470 160 L580 200 L680 170 L780 210 L880 180 L980 210 L1080 190 L1200 210 L1200 240 L0 240 Z" fill="#062516" opacity="0.85" />
      </svg>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-16 pb-10 sm:pb-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-pill bg-white/10 backdrop-blur-sm border border-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/85">
            <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulseDot" />
            {t('landing.heroKicker')}
          </div>

          <h1 className="mt-5 sm:mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.02] notranslate" translate="no">
            <span className="block">Share the ride.</span>
            <span className="block text-brand">Split the cost.</span>
          </h1>
          <p className="mt-4 text-white/85 text-base sm:text-lg max-w-2xl">
            {t('landing.heroValueProp')}
          </p>
        </div>

          {/* Search panel (glass) */}
          <form
            onSubmit={submit}
            className="w-full mt-3 sm:mt-4 rounded-card bg-white/10 backdrop-blur-md ring-1 ring-white/20 shadow-elevate p-3 sm:p-4"
          >
            <div className="grid gap-2 sm:gap-3 sm:grid-cols-[1.6fr_1.6fr_0.9fr_auto_auto] sm:items-end">
              <div className="[&_label]:!text-white/85 [&_input]:!text-text">
                <CityAutocomplete
                  label="From"
                  value={from}
                  onChange={setFrom}
                  placeholder="Kigali (Nyabugogo)…"
                  error={attempted && !from ? 'Pick where you start.' : null}
                />
              </div>
              <div className="[&_label]:!text-white/85 [&_input]:!text-text">
                <CityAutocomplete
                  label="To"
                  value={to}
                  onChange={setTo}
                  placeholder="Musanze, Gisenyi…"
                  error={attempted && !to ? 'Pick where you’re going.' : null}
                />
              </div>
              <div className="[&_label]:!text-white/85 [&_input]:!text-text">
                <DatePicker label="Date" value={date} onChange={setDate} disablePast />
              </div>
              <div className="[&_label]:!text-white/85 [&_input]:!text-text">
                <TextField
                  label="Passengers"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={7}
                  value={pax}
                  onChange={(e) => setPax(e.target.value)}
                  className="sm:w-24"
                />
              </div>
              <Button type="submit" size="lg" className="sm:h-12 sm:min-w-[140px]">
                {t('landing.searchCta')}
              </Button>
            </div>
            <p className="mt-2 sm:mt-3 text-xs text-white/70">
              {t('landing.browseHint')}
            </p>
          </form>
      </div>
    </section>
  );
}

/* ─── HOW IT WORKS ──────────────────────────────────────────────────────── */

function HowItWorks() {
  const { t } = useTranslation();
  const steps = [
    {
      title: t('landing.how.step1Title'),
      body: t('landing.how.step1Body'),
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: t('landing.how.step2Title'),
      body: t('landing.how.step2Body'),
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
          <rect x="3.75" y="5" width="16.5" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M3.75 9.5h16.5" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="8" cy="14" r="1.25" fill="currentColor" />
          <circle cx="12" cy="14" r="1.25" fill="currentColor" />
          <circle cx="16" cy="14" r="1.25" fill="currentColor" />
        </svg>
      ),
    },
    {
      title: t('landing.how.step3Title'),
      body: t('landing.how.step3Body'),
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
          <path d="M4 17V9l1.6-4h12.8L20 9v8" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <circle cx="7.5" cy="17" r="1.75" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="16.5" cy="17" r="1.75" stroke="currentColor" strokeWidth="1.75" />
          <path d="M4 12h16" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      ),
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">
      <SectionHead title={t('landing.how.title')} sub={t('landing.how.sub')} />
      <div className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={i}
            className="rounded-card border border-border bg-bg-elevated p-5 shadow-card"
          >
            <div className="inline-flex items-center justify-center h-11 w-11 rounded-field bg-brand/12 text-brand">
              {s.icon}
            </div>
            <h3 className="mt-4 text-lg font-bold text-text">{s.title}</h3>
            <p className="mt-1.5 text-sm text-text-muted leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── POPULAR CORRIDORS ─────────────────────────────────────────────────── */

const POPULAR = [
  { label: 'Kigali → Musanze', from: 'name:Nyabugogo', to: 'name:Musanze',        hint: 'volcanoes' },
  { label: 'Kigali → Rubavu',  from: 'name:Nyabugogo', to: 'name:Rubavu (Gisenyi)', hint: 'lake kivu' },
  { label: 'Kigali → Huye',    from: 'name:Nyabugogo', to: 'name:Huye',           hint: 'south road' },
  { label: 'Kigali → Kayonza', from: 'name:Nyabugogo', to: 'name:Kayonza',        hint: 'east gateway' },
  { label: 'Kigali → Nyagatare', from: 'name:Nyabugogo', to: 'name:Nyagatare',    hint: 'far east' },
  { label: 'Kigali → Rusizi',  from: 'name:Nyabugogo', to: 'name:Rusizi (Cyangugu)', hint: 'lake road' },
];

function PopularCorridors() {
  const { t } = useTranslation();
  return (
    <section className="bg-surface border-y border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">
        <SectionHead title={t('landing.corridorsTitle')} sub={t('landing.corridorsSub')} />
        <div className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 sm:grid-cols-2 md:grid-cols-3">
          {POPULAR.map((p) => (
            <Link
              key={`${p.from}-${p.to}`}
              to={`/search?from=${encodeURIComponent(p.from)}&to=${encodeURIComponent(p.to)}`}
              className="group rounded-card border border-border bg-bg-elevated hover:bg-surface-hover hover:border-brand/40 hover:shadow-card transition-colors p-4 flex items-center gap-3"
            >
              <RouteGlyph />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-text truncate">{p.label}</div>
                <div className="text-xs text-text-muted truncate">{p.hint}</div>
              </div>
              <ArrowIcon className="text-text-muted group-hover:text-brand shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function RouteGlyph() {
  return (
    <div className="shrink-0 h-10 w-10 rounded-field bg-brand/10 grid place-items-center text-brand">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
        <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="18" cy="6" r="2" stroke="currentColor" strokeWidth="1.75" />
        <path d="M8 16 L16 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeDasharray="2 2.5" />
      </svg>
    </div>
  );
}

function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className={className}>
      <path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── TRUST & SAFETY ────────────────────────────────────────────────────── */

function Trust() {
  const { t } = useTranslation();
  const items = [
    { title: t('landing.trust.verified'), body: t('landing.trust.verifiedBody'), icon: <ShieldIcon /> },
    { title: t('landing.trust.code'),     body: t('landing.trust.codeBody'),     icon: <KeyIcon /> },
    { title: t('landing.trust.ratings'),  body: t('landing.trust.ratingsBody'),  icon: <StarIcon /> },
    { title: t('landing.trust.fair'),     body: t('landing.trust.fairBody'),     icon: <ScaleIcon /> },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">
      <SectionHead title={t('landing.trust.title')} sub={t('landing.trust.sub')} />
      <div className="mt-6 sm:mt-8 grid gap-3 sm:gap-4 sm:grid-cols-2 md:grid-cols-4">
        {items.map((it, i) => (
          <div key={i} className="rounded-card border border-border bg-bg-elevated p-5">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-field bg-brand/12 text-brand">
              {it.icon}
            </div>
            <div className="mt-3 text-sm font-bold text-text">{it.title}</div>
            <div className="mt-1 text-xs text-text-muted leading-relaxed">{it.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path d="M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6l-7-3Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <circle cx="9" cy="12" r="3.75" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12.5 12H21m-3.5 0v3.5M14 12v2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.9-5.4 2.9 1-6L3.3 9.9l6-.9L12 3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
      <path d="M12 4v16M4 20h16M6 8l3 7-3 0-3 0 3-7Zm12 0 3 7-3 0-3 0 3-7Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ─── DRIVE WITH TUJYANE ────────────────────────────────────────────────── */

function DriveStrip() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const cta = status === 'authenticated' ? '/dashboard/journeys/new' : '/auth?intent=driver';
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-10 sm:pb-16">
      <div
        className="relative overflow-hidden rounded-card p-6 sm:p-10 bg-navy text-white shadow-elevate"
        style={{
          backgroundImage:
            'radial-gradient(500px 200px at 110% -20%, rgb(46 158 58 / 0.55), transparent 70%)',
        }}
      >
        <div className="grid gap-4 sm:gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div>
            <div className="inline-block t-caption text-white/70">{t('landing.drive.kicker')}</div>
            <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              {t('landing.drive.title')}
            </h2>
            <p className="mt-3 text-white/80 max-w-xl text-sm sm:text-base">
              {t('landing.drive.body')}
            </p>
          </div>
          <div className="flex md:justify-end">
            <Link to={cta} className="w-full md:w-auto">
              <Button size="lg" className="w-full md:w-auto sm:min-w-[220px]">
                {t('landing.drive.cta')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── FOOTER ────────────────────────────────────────────────────────────── */

function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <div className="min-w-0">
            <Brand heightPx={36} layout="full" />
            <p className="mt-3 text-xs text-text-muted max-w-xs">{t('app.slogan')}</p>
          </div>
          <FooterCol title={t('landing.footer.product')} links={[
            { to: '/', label: t('landing.footer.search') },
            { to: '/auth?intent=driver', label: t('landing.footer.post') },
            { to: '/how-it-works', label: 'How it works' },
          ]} />
          <FooterCol title={t('landing.footer.company')} links={[
            { to: '/about', label: t('landing.footer.about') },
            { to: '/about', label: t('landing.footer.contact') },
          ]} />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{t('landing.footer.language')}</div>
            <div className="mt-3"><LanguageSwitcher /></div>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-text-subtle">
          <div>© {year} {t('landing.footer.rights')}</div>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-text">{t('landing.footer.terms')}</Link>
            <Link to="/privacy" className="hover:text-text">{t('landing.footer.privacy')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{title}</div>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.label}><Link to={l.to} className="text-text hover:text-brand">{l.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}

/* ─── SHARED ────────────────────────────────────────────────────────────── */

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text">{title}</h2>
      <p className="text-sm sm:text-base text-text-muted">{sub}</p>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ds/Button';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';

// Placeholder home — browsing and search will land here. No auth required.
export default function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 sm:px-6 py-10">
      <div className="max-w-4xl mx-auto grid gap-4">
        <div className="rounded-card p-6 sm:p-8 bg-navy text-white shadow-elevate relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-30"
               style={{
                 backgroundImage:
                   'radial-gradient(600px 200px at 90% -20%, rgb(46 158 58 / 0.55), transparent)',
               }} />
          <div className="relative">
            <div className="t-caption text-white/70">{t('app.name')}</div>
            <h1 className="t-display mt-1">{t('app.tagline')}</h1>
            <p className="mt-3 text-white/80 max-w-xl">
              Anyone can search for journeys. You only need an account to book a seat or
              post your own trip.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/styleguide"><Button variant="secondary">View design system</Button></Link>
              <Link to="/auth"><Button>{t('nav.signup')}</Button></Link>
            </div>
          </div>
        </div>

        <Card>
          <CardTitle>Search a journey</CardTitle>
          <CardDescription>Coming next — this is where the browsable list will live.</CardDescription>
        </Card>
      </div>
    </div>
  );
}

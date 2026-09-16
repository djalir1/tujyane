import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { Button } from '@/components/ds/Button';
import { Card, CardDescription, CardTitle } from '@/components/ds/Card';

// Soft gate: renders `children` for authed users; for anon users renders a
// friendly "sign in to continue" prompt with the destination remembered. Used
// when an action (book, post) is attempted from an otherwise-open flow, so we
// don't hard-block browsing.
export function AuthPromptGate({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return null;
  if (status === 'authenticated') return <>{children}</>;

  const returnTo = location.pathname + location.search;
  return (
    <Card className="max-w-md mx-auto">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      <div className="mt-5 flex gap-3">
        <Link to="/auth" state={{ from: returnTo }} className="flex-1">
          <Button fullWidth>Sign in / Create account</Button>
        </Link>
      </div>
      <p className="mt-4 text-xs text-ink-500">
        Browsing and searching journeys always work without an account.
      </p>
    </Card>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/AuthForms';
import { redirectIfSignedIn } from '@/lib/guards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  await redirectIfSignedIn();

  return (
    <>
      <h1 className="text-gradient font-display text-2xl font-bold tracking-tightest">Welcome back.</h1>
      <p className="mb-7 mt-2 text-sm text-muted">
        Sign in to manage your bookings, vehicles, and photos.
      </p>

      {/* useSearchParams() needs a Suspense boundary — without one the whole
          route is forced into client-side rendering at build time. */}
      <Suspense fallback={<div className="h-64" />}>
        <LoginForm />
      </Suspense>
    </>
  );
}

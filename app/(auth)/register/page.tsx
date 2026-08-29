import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/AuthForms';
import { redirectIfSignedIn } from '@/lib/guards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  await redirectIfSignedIn();

  return (
    <>
      <h1 className="text-gradient font-display text-2xl font-bold tracking-tightest">
        Create your account.
      </h1>
      <p className="mb-7 mt-2 text-sm text-muted">
        Save your vehicles, book in seconds, and keep every before-and-after photo in one place.
      </p>

      <Suspense fallback={<div className="h-96" />}>
        <RegisterForm />
      </Suspense>
    </>
  );
}

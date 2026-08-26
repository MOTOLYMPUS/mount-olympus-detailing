import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/AuthForms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-gradient font-display text-2xl font-bold tracking-tightest">
        Choose a new password.
      </h1>
      <p className="mb-7 mt-2 text-sm text-muted">
        Once you save it you will be signed out everywhere and can sign back in.
      </p>

      <Suspense fallback={<div className="h-56" />}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}

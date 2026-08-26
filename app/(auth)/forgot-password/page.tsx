import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotPasswordForm } from '@/components/auth/AuthForms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-gradient font-display text-2xl font-bold tracking-tightest">
        Reset your password.
      </h1>
      <p className="mb-7 mt-2 text-sm text-muted">
        Enter the email on your account and we will send you a link.
      </p>

      <Suspense fallback={<div className="h-48" />}>
        <ForgotPasswordForm />
      </Suspense>
    </>
  );
}

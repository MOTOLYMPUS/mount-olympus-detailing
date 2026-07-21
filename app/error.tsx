'use client';

import { useEffect } from 'react';
import { business } from '@/lib/business';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Wire this to your error reporter (Sentry etc.) when you add one.
    console.error('[app error]', error);
  }, [error]);

  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow mb-4">Something broke</p>
      <h1 className="font-display text-3xl font-bold tracking-tightest sm:text-4xl">
        We hit an error on our end.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        Nothing you entered was lost on purpose — try again, and if it keeps happening call us
        at{' '}
        <a href={business.phoneHref} className="text-white underline">
          {business.phone}
        </a>{' '}
        and we&rsquo;ll take your details directly.
      </p>
      <button onClick={reset} className="btn-apex mt-8">
        Try Again
      </button>
      {error.digest && (
        <p className="mt-6 font-mono text-[11px] text-subtle">Reference: {error.digest}</p>
      )}
    </main>
  );
}

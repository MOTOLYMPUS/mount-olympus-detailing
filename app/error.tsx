'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The root error boundary.
//
// THIS FILE HAS TO RENDER WHEN EVERYTHING ELSE HAS FAILED, which constrains what
// it may import. It deliberately does NOT use <Backdrop>: that pulls in
// next/image and data/media.ts, and an error screen that depends on the image
// pipeline is an error screen that can fail for the same reason the page did.
//
// The decoration here is therefore three plain <div>s carrying classes that
// already exist in globals.css — a contour texture, a mesh gradient, a scrim —
// plus the <Mountains> SVG, which is pure inline geometry with no data
// dependency. Nothing to fetch, nothing to decode, nothing to break.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { business } from '@/lib/business';
import { Mountains } from '@/components/visual/Effects';

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
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 isolate" aria-hidden="true">
        {/* Contour lines — "altitude", the same shorthand the aviation sections
            use. Muted to 40% so the copy in front stays the brightest thing. */}
        <div className="layer tex-topo opacity-40" />
        <div className="layer mesh-gradient opacity-50" />
        {/* Scrim last but one: this is the layer that keeps `text-muted`
            (#B4B4B4) above 4.5:1 no matter what the gradients do behind it. */}
        <div className="layer bg-gradient-to-b from-obsidian via-obsidian/60 to-obsidian" />
        <div className="layer tex-noise" />
        <Mountains className="h-[30vh] min-h-[160px]" opacity={0.08} />
      </div>

      <p className="eyebrow mb-4">Something broke</p>
      <h1 className="text-gradient font-display text-3xl font-bold tracking-tightest sm:text-4xl">
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

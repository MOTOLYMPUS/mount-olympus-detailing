// ─────────────────────────────────────────────────────────────────────────────
// 404.
//
// A server component, so this costs no JavaScript at all. It can afford
// <Backdrop> where app/error.tsx cannot: a 404 means a route was missing, not
// that the app is broken, so the image pipeline is still trustworthy. `photo`
// is still off — a decorative download on a dead-end page is bytes spent on
// somebody who is already leaving.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import Backdrop from '@/components/visual/Backdrop';
import { Mountains } from '@/components/visual/Effects';

export default function NotFound() {
  return (
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 isolate" aria-hidden="true">
        <Backdrop texture="topo" photo={false} mesh grain intensity="normal" />
        <Mountains className="h-[30vh] min-h-[160px]" opacity={0.08} />
      </div>

      <p className="eyebrow mb-4">404</p>
      <h1 className="text-gradient font-display text-4xl font-bold tracking-tightest sm:text-5xl">
        That page isn&rsquo;t here.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        The link may be out of date. Everything — services, pricing, and estimates for
        automotive, marine, and aviation — lives on the main page.
      </p>
      <Link href="/" className="btn-apex mt-8">
        Back to Home
      </Link>
    </main>
  );
}

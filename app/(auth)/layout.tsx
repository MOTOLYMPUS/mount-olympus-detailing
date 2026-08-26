// ─────────────────────────────────────────────────────────────────────────────
// Layout for the four unauthenticated account screens.
//
// A route group `(auth)` rather than a path segment, so the URLs stay short —
// /login, not /auth/login. Short auth URLs matter: they get typed, texted, and
// read out loud.
//
// THIS IS THE ONE PLACE IN THE APP WHERE SPECTACLE IS WARRANTED. Everything
// past the sign-in button is a working tool opened dozens of times a day, where
// drifting particles behind a data table are an obstacle. The auth screen is
// seen once, briefly, and it is the app's first impression — so it gets the
// full stack the marketing site uses.
//
// Stacking, back to front:
//   1. Backdrop  — carbon texture + mesh gradient + readability scrim + grain
//   2. Mountains — the brand silhouette, grounding the composition
//   3. Motes     — ten slow dust particles
//   4. Content   — brand lockup, the glass card, the help footer
//
// COST OF ALL OF THAT: zero extra network requests. `photo={false}` is
// deliberate — Backdrop's photo layer is a lazily-loaded next/image, and this
// is the one page where the user is actively waiting to get past it. Layers
// 1–3 are CSS gradients plus one inline SVG, all already in the stylesheet the
// page must download anyway, so first paint is unchanged.
//
// The decoration lives in a `-z-10 isolate` wrapper. `isolate` gives it its own
// stacking context, which keeps Backdrop's internal `-z-10` layers contained
// rather than letting them escape to the root; `-z-10` on the wrapper puts the
// whole group behind the content without needing a z-index on every sibling.
// The root <div> deliberately carries NO background — <body> already paints
// obsidian, and a background here would paint over a negative-z child and hide
// the entire backdrop.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { business } from '@/lib/business';
import Backdrop from '@/components/visual/Backdrop';
import { Motes, Mountains } from '@/components/visual/Effects';

export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 isolate" aria-hidden="true">
        <Backdrop texture="carbon" photo={false} mesh grain intensity="normal" />
        {/* 0.07, not the component's 0.14 default. The footer's help line sits
            directly over the nearest ridge, and at the default the silhouette
            lifts the background behind that text to roughly #2a2a2a — which
            drops #8E8E8E body copy under 4.5:1. At 0.07 the ridge lands near
            #131313 and the same text clears 6:1 with room to spare. Legibility
            wins over drama; the mountains still read, just quietly. */}
        <Mountains className="h-[34vh] min-h-[180px]" opacity={0.07} />
        {/* Few and slow. Ten particles is ambience; twenty is a screensaver. */}
        <Motes kind="dust" count={10} />
      </div>

      <header className="px-6 py-6">
        <Link href="/" className="font-display text-[13px] font-bold tracking-tightest">
          <span className="text-white">{business.logo.lead}</span>{' '}
          <span className="text-flare">{business.logo.tail}</span>
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        {/* `glass` + `light-sweep`: a small, non-scrolling surface, which is the
            only kind that can afford backdrop-filter. `relative` and
            `overflow-hidden` are what the sweep's ::after band needs to travel
            across and be clipped by. */}
        <div className="glass light-sweep relative w-full max-w-[380px] overflow-hidden rounded-sm p-6 shadow-glass sm:p-7">
          {children}
        </div>
      </main>

      <footer className="px-6 pb-8 text-center">
        {/* `text-muted` (#B4B4B4) rather than `text-subtle` (#8E8E8E): this is
            the only body copy on the page sitting over decoration rather than
            over flat obsidian, so it gets the brighter of the two greys. */}
        <p className="text-[12px] text-muted">
          Need a hand?{' '}
          <a href={business.phoneHref} className="text-muted underline-offset-4 hover:text-white hover:underline">
            {business.phone}
          </a>
        </p>
      </footer>
    </div>
  );
}

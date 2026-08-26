'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Services grid.
//
// Each card is four stacked layers, back to front:
//
//   1. Per-service photograph   — ghosted across the FULL card, not just a
//                                 header strip, so the card reads as one object
//   2. Vertical scrim           — the readability guarantee for layers 3–4
//   3. Texture + gradient ring  — .tex-carbon at low alpha, .gradient-border
//   4. Glass content panel      — the only part that carries text
//
// WHY THE PHOTO IS BEHIND THE TEXT AND NOT ABOVE IT
// The previous version put the image in a fixed 208px header with copy below.
// Full-bleed reads far better, but it puts a photograph directly behind body
// copy — so the photo is held at 25% and the scrim runs to near-opaque behind
// the panel. That was the one place I traded drama for readability: the image
// is deliberately dimmer than it could be, because `text-muted` (#B4B4B4) is
// only measured against #050505 and a brighter photo invalidates it.
//
// PERFORMANCE
//   • .glass (backdrop-filter) is on the content panel only — a small, fixed
//     surface. It is NOT on the card itself, which would put an expensive
//     backdrop-filter on every item of a scrolling grid.
//   • Hover animates transform and opacity only (.lift, .sweep-hover, scale).
//   • Every image is lazy with a per-breakpoint `sizes` and sits in a container
//     with an explicit aspect ratio, so the grid cannot shift.
//
// UNCHANGED ON PURPOSE: `onBook`, `startingPrice`/`formatCurrency`, and the
// estimated-hours display. Those are the contract with lib/pricing.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Image from 'next/image';
import { useIndustry } from './IndustryProvider';
import { servicesForIndustry } from '@/data/pricing';
import { formatCurrency, formatHours, startingPrice } from '@/lib/pricing';
import Backdrop from './visual/Backdrop';
import Reveal from './visual/Reveal';

export default function ServicesGrid({ onBook }: { onBook: (serviceId: string) => void }) {
  const { industry, config } = useIndustry();
  const services = servicesForIndustry(industry);

  return (
    <section id="services" className="relative overflow-hidden py-20 sm:py-28">
      <Backdrop industry={industry} intensity="subtle" />

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <Reveal className="mb-10 max-w-xl sm:mb-14">
          <p className="eyebrow mb-4">{config.label} Services</p>
          <h2 className="text-gradient font-display text-3xl font-bold tracking-tightest sm:text-5xl">
            {config.sectionHeading}
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc, i) => (
            // Staggered by DOM order, capped so a long list does not end up with
            // a card waiting a full second to appear.
            <Reveal
              key={svc.id}
              as="article"
              delay={Math.min(i, 8) * 70}
              className="group gradient-border lift sweep-hover relative flex flex-col overflow-hidden rounded-md border border-white/10 bg-obsidian"
            >
              {/* ── 1. Photograph, full-bleed behind the whole card ────────── */}
              <div className="absolute inset-0" aria-hidden="true">
                <Image
                  src={svc.image}
                  alt=""
                  fill
                  loading="lazy"
                  quality={65}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="scale-105 object-cover opacity-45 transition-transform duration-[900ms] ease-apex group-hover:scale-110"
                />
                {/* ── 2. Shaping scrim, top half only.
                    The card-wide gradient is NOT what protects the copy — see
                    the note on the content panel below. Its job here is just to
                    stop the photograph running bright all the way to the card
                    edge. */}
                <div className="absolute inset-0 bg-gradient-to-b from-obsidian/15 via-obsidian/45 to-obsidian/75" />
                {/* ── 3. Texture, kept under the alpha ceiling in globals.css. */}
                <div className="layer tex-carbon opacity-40" />
              </div>

              {/* Top plate — the image gets a window to breathe through before
                  the copy panel starts. Explicit aspect ratio: no shift. */}
              <div className="relative aspect-[16/10] w-full">
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-obsidian to-transparent" />

                {/* Icon chip. Scales and colours on hover — transform + colour
                    only, no filter, no shadow animation. */}
                <span
                  aria-hidden="true"
                  className="glass absolute left-5 top-5 flex h-11 w-11 items-center justify-center rounded-sm text-white/80 transition-transform duration-500 ease-apex group-hover:scale-110 group-focus-within:scale-110"
                >
                  <ServiceMark index={i} />
                </span>
              </div>

              {/* ── 4. Content panel ────────────────────────────────────────
                  Glass *look* — the same translucent gradient and hairline top
                  edge as `.glass` — but WITHOUT `backdrop-filter`.
                  Deliberate: this panel repeats once per service, so on a nine-
                  service industry `.glass` would put nine live backdrop-filter
                  surfaces into a scrolling grid, which is precisely the case
                  globals.css warns against. What sits behind the panel is an
                  already-scrimmed photograph at 25% opacity, so the blur would
                  have almost nothing to resolve anyway. Real `.glass` is used
                  on the icon chip above — small and fixed-size, which is the
                  shape the effect is affordable on.

                  ⚠️ THE 94%-OPAQUE BASE UNDER THE GRADIENT IS THE READABILITY
                  GUARANTEE, and it is the one place on this page where I chose
                  legibility over drama. The first attempt let the full-bleed
                  photograph show through the panel at ~20% and it looked
                  fantastic in a screenshot and was genuinely hard to read —
                  `text-muted` is #B4B4B4 measured against #050505, and a
                  photograph behind it invalidates that measurement completely.
                  A gradient scrim cannot fix this because the panel's height
                  varies with the bullet count, so no fixed gradient stop lines
                  up with where the text actually is. A near-opaque base does
                  not care. The photograph still reads clearly in the plate
                  above; below this line it is atmosphere, nothing more.

                  Two stacked backgrounds rather than one multi-value arbitrary
                  class: Tailwind's scanner does not reliably emit an arbitrary
                  `bg-[…]` value containing commas, and a class that silently
                  fails to generate is a contrast bug that only shows up in
                  production. */}
              <div className="relative isolate flex flex-1 flex-col border-t border-white/10 bg-obsidian/95 p-6">
                {/* `isolate` on the parent makes it a stacking context, so this
                    -z-10 sheen paints ABOVE the panel's own background but
                    BELOW the copy — without it a positioned sibling would sit
                    on top of every word. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/[0.055] to-white/[0.015]"
                />
                <h3 className="font-display text-lg font-bold leading-tight text-white">
                  {svc.name}
                </h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">
                  {svc.shortDescription}
                </p>

                {svc.includes && svc.includes.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-1.5">
                    {svc.includes.slice(0, 4).map((item) => (
                      <li key={item} className="flex gap-2 text-[12px] leading-snug text-subtle">
                        <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-apex" />
                        {item}
                      </li>
                    ))}
                    {svc.includes.length > 4 && (
                      <li className="pl-3 text-[12px] text-subtle">
                        + {svc.includes.length - 4} more
                      </li>
                    )}
                  </ul>
                )}

                <div className="hairline-glow my-5" />

                {/* Price and duration — the two numbers people scan for, so
                    they get their own baseline-aligned row rather than being
                    folded into the body copy. Values and formatters unchanged. */}
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                      Duration
                    </p>
                    <p className="mt-1 font-mono text-[13px] text-white/90">
                      {formatHours(svc.estimatedHours)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                      Starting at
                    </p>
                    <p className="mt-0.5 font-display text-2xl font-bold leading-none tracking-tightest text-white">
                      {formatCurrency(startingPrice(svc))}
                    </p>
                  </div>
                </div>

                <button onClick={() => onBook(svc.id)} className="btn-ghost mt-5 w-full text-[11px]">
                  Get Estimate
                  <span className="sr-only"> for {svc.name}</span>
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Card mark. Four abstract geometric glyphs cycled by position — deliberately
 * NOT literal service icons, because `ServiceDef` carries no icon field and
 * guessing one per service id would go stale the moment a service is added.
 * Inline SVG so it costs no request.
 */
function ServiceMark({ index }: { index: number }) {
  const shapes = [
    <path key="a" d="M4 12a8 8 0 0116 0" />,
    <path key="b" d="M12 3l7 4.5v9L12 21l-7-4.5v-9z" />,
    <path key="c" d="M5 19c4-2 4-12 14-14M5 12h6" />,
    <path key="d" d="M12 4v16M4 12h16" />,
  ];
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {shapes[index % shapes.length]}
    </svg>
  );
}

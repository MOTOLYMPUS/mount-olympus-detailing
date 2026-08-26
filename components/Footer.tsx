// ─────────────────────────────────────────────────────────────────────────────
// Footer.
//
// ⚠️ CONTACT RULE — this file renders `business.*` and NOTHING else.
//
// lib/business.ts also exports `internalNotificationTargets`, which holds a
// backup SMS number for owner alerts. It is deliberately kept OUT of the
// `business` object so it cannot be reached by anything rendering `business.*`,
// and it must never appear on a page, in metadata, or in structured data. It is
// not imported here and must not be. Do not "helpfully" add a second phone
// number to the contact column.
//
// The mountain silhouette is the brand mark, drawn as SVG (see
// visual/Effects.tsx) — zero network cost, resolution independent, and it gives
// the page a horizon to end on instead of stopping dead.
// ─────────────────────────────────────────────────────────────────────────────

import { BUSINESS_DETAILS_ARE_PLACEHOLDER, business } from '@/lib/business';
import { Mountains } from './visual/Effects';

export default function Footer() {
  return (
    <footer className="relative overflow-hidden pb-14 pt-16">
      {/* Divider that reads as a seam of light rather than a grey rule. */}
      <div className="hairline-glow absolute inset-x-0 top-0" aria-hidden="true" />

      {/* Decorative depth. Every one of these is inert to the pointer and to
          assistive tech, and none of them animates anything but transform. */}
      <div className="layer -z-10" aria-hidden="true">
        <div className="layer tex-topo opacity-50" />
        <div className="layer mesh-gradient opacity-40" />
        <Mountains className="h-[38%] min-h-[120px]" opacity={0.07} />
        {/* Scrim over the peaks so the contact copy keeps its contrast. */}
        <div className="layer bg-gradient-to-t from-obsidian via-obsidian/70 to-obsidian/30" />
        <div className="layer tex-noise" />
      </div>

      <div className="relative mx-auto flex max-w-[1400px] flex-col gap-10 px-6 lg:flex-row lg:items-start lg:justify-between lg:px-10">
        <div>
          <p className="font-display text-lg font-bold tracking-tightest">
            {business.logo.lead} <span className="text-flare">/</span> {business.logo.tail}
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Detailing, correction, and protective coatings for automotive, marine, and aviation
            owners who hold their property to a standard.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <p className="eyebrow mb-4">Studio</p>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              <li>
                <a href="#services" className="hover:text-white">
                  Services
                </a>
              </li>
              <li>
                <a href="#gallery" className="hover:text-white">
                  Gallery
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-white">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#about" className="hover:text-white">
                  About
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-4">Contact</p>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              <li>
                <a href={`mailto:${business.email}`} className="break-all hover:text-white">
                  {business.email}
                </a>
              </li>
              <li>
                <a href={business.phoneHref} className="hover:text-white">
                  {business.phone}
                </a>
              </li>
              <li>{business.serviceArea}</li>
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-4">Hours</p>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              {business.hours.map((h) => (
                <li key={h.days}>
                  <span className="block">{h.days}</span>
                  <span className="text-subtle">{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-12 max-w-[1400px] px-6 lg:px-10">
        <div className="hairline-glow" />

        {/* Renders only while lib/business.ts still holds placeholder details. */}
        {BUSINESS_DETAILS_ARE_PLACEHOLDER && (
          <p className="mt-6 rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[12px] leading-relaxed text-amber-200">
            <strong className="font-semibold">Setup notice:</strong> the contact details above are
            placeholders. Replace them in <code className="font-mono">lib/business.ts</code> and set{' '}
            <code className="font-mono">BUSINESS_DETAILS_ARE_PLACEHOLDER</code> to{' '}
            <code className="font-mono">false</code>.
          </p>
        )}

        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
          © {new Date().getFullYear()} {business.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Hero — the most layered surface on the site.
//
// Stacking order, back to front:
//
//   1. Ghosted secondary vehicle   — depth plane, parallaxed, ~10% opacity
//   2. Primary photograph          — the LCP element, `priority`
//   3. Industry texture            — carbon / ripple / contour
//   4. Mesh gradient               — colour and slow movement
//   5. Readability scrims          — vertical + horizontal
//   6. Specular light sweep        — the "coated paint" gloss pass
//   7. Mountain silhouette         — brand, and it grounds the composition
//   8. Motes                       — spray / foam / cloud per industry
//   9. Pointer spotlight           — desktop only
//  10. Content
//
// PERFORMANCE NOTE — layers 1–9 add ONE extra network request (the ghost
// image, lazily loaded). Everything else is CSS and SVG. The LCP element is
// unchanged: still one `priority` next/image, still the only thing competing
// for early bandwidth.
//
// Scrims (layer 5) sit ABOVE the photographs and BELOW the content for a
// reason — the headline must clear AA contrast over whatever part of the
// photograph ends up behind it, at any viewport size.
// ─────────────────────────────────────────────────────────────────────────────

import Image from 'next/image';
import { motion } from 'framer-motion';
import { useIndustry } from './IndustryProvider';
import IndustrySelector from './IndustrySelector';
import { usePrefersReducedMotion } from '@/lib/useDialog';
import { heroGhostImages } from '@/data/media';
import { Motes, Mountains, Parallax, Spotlight } from './visual/Effects';
import { Industry } from '@/lib/types';

/** Texture and particle type that mean something in each trade. */
const AMBIENCE: Record<
  Industry,
  { texture: string; motes: 'dust' | 'foam' | 'spray' | 'cloud' }
> = {
  automotive: { texture: 'tex-carbon', motes: 'foam' },
  marine: { texture: 'ripple-layer', motes: 'spray' },
  aviation: { texture: 'tex-topo', motes: 'cloud' },
};

export default function Hero({ onStartEstimate }: { onStartEstimate: () => void }) {
  const { config, industry } = useIndustry();
  const reduced = usePrefersReducedMotion();
  const ambience = AMBIENCE[industry];
  const ghost = heroGhostImages[industry];

  return (
    <section
      id="top"
      className="light-sweep relative flex min-h-[100svh] w-full flex-col justify-end overflow-hidden"
    >
      {/* ── 1. Ghosted depth plane ─────────────────────────────────────────
          Parallaxed slower than the page, so it reads as further away. Lazy —
          it is decoration and must not delay the LCP. */}
      <Parallax speed={0.1} className="absolute inset-0 -z-10">
        <div className="absolute inset-0 scale-110 opacity-[0.10]">
          <Image
            src={ghost.src}
            alt=""
            fill
            loading="lazy"
            quality={55}
            sizes="100vw"
            className="object-cover object-center blur-[3px]"
          />
        </div>
      </Parallax>

      {/* ── 2. Primary photograph — the LCP element ───────────────────────── */}
      <div className="absolute inset-0">
        <motion.div
          key={industry}
          initial={reduced ? false : { scale: 1.06, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: reduced ? 0 : 1.6, ease: [0.22, 1, 0.36, 1] }}
          className="h-full w-full"
        >
          <Image
            src={config.hero.src}
            alt={config.hero.alt}
            fill
            priority
            quality={85}
            sizes="100vw"
            className="object-cover object-center"
          />
        </motion.div>

        {/* ── 3. Industry texture ─────────────────────────────────────────── */}
        <div className={`layer ${ambience.texture} opacity-50`} aria-hidden="true" />

        {/* ── 4. Mesh gradient ────────────────────────────────────────────── */}
        <div className="layer mesh-gradient opacity-80" aria-hidden="true" />

        {/* ── 5. Scrims. Unchanged from the original — these are the measured
               values that keep the headline above 4.5:1. */}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/55 to-obsidian/75" />
        <div className="absolute inset-0 bg-gradient-to-r from-obsidian/80 via-obsidian/20 to-transparent" />

        {/* Grain last, so it sits over the gradients and kills their banding. */}
        <div className="layer tex-noise" aria-hidden="true" />
      </div>

      {/* ── 7. Mountains ─────────────────────────────────────────────────── */}
      <Mountains className="z-[1] h-[22vh] min-h-[130px]" opacity={0.09} />

      {/* ── 8. Motes ─────────────────────────────────────────────────────── */}
      <Motes kind={ambience.motes} count={ambience.motes === 'cloud' ? 6 : 16} className="z-[2]" />

      {/* ── 9. Pointer spotlight ─────────────────────────────────────────── */}
      <Spotlight className="z-[3]" />

      {/* ── 10. Content ──────────────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-6 pb-12 pt-32 sm:pb-16 lg:gap-14 lg:px-10 lg:pb-20 lg:pt-40">
        <motion.div
          key={`copy-${industry}`}
          initial={reduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <p className="eyebrow mb-4 text-muted">{config.eyebrow}</p>

          <h1 className="text-gradient font-display text-[15vw] font-bold leading-[0.95] tracking-tightest sm:text-[58px] lg:text-[76px]">
            {config.headline[0]}
            <br />
            {config.headline[1]}
          </h1>

          <p className="mt-5 max-w-lg font-body text-[15px] leading-relaxed text-muted sm:text-base">
            {config.subheadline}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button onClick={onStartEstimate} className="btn-apex">
              {config.ctaPrimary}
            </button>
            <a href="#services" className="btn-ghost">
              {config.ctaSecondary}
            </a>
          </div>
        </motion.div>

        {/* Industry selection — the entry point that switches the whole app. */}
        <div>
          <p className="eyebrow mb-3">What are we detailing?</p>
          <IndustrySelector />
        </div>
      </div>

      {/* Scroll affordance. Hidden from assistive tech — it duplicates the
          "View Services" link already in the tab order above. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-4 z-10 hidden justify-center lg:flex"
        aria-hidden="true"
      >
        <span className="flex h-9 w-5 items-start justify-center rounded-full border border-white/25 pt-1.5">
          <span className="h-1.5 w-0.5 animate-bounce rounded-full bg-white/60" />
        </span>
      </div>
    </section>
  );
}

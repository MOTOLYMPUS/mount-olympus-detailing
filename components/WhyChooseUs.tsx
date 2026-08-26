'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Why choose us.
//
// ⚠️ NO ANIMATED STATISTICS HERE, AND THAT IS THE POINT.
//
// The obvious "premium" move for this section is a row of counting-up numbers —
// years in business, jobs completed, satisfaction percentage. `<Counter>` from
// components/visual/Effects.tsx exists and would have made it trivial.
//
// Not one of those figures exists anywhere in this codebase. data/reviews.ts was
// emptied precisely because it shipped an invented "5.0 · 214 Google Reviews"
// badge, and inventing "12 years / 3,400 vehicles / 99% satisfaction" here would
// be the identical problem wearing a different component. An animated number
// draws MORE attention and more credence than a static one, so animating a
// fabricated statistic is strictly worse than printing it.
//
// The only numbers below are the ordinal markers 01–06, which are positions in
// a list and claim nothing. They are not counted up.
//
// If the owner supplies verifiable figures, this is where a <Counter> row goes.
// ─────────────────────────────────────────────────────────────────────────────

import { useIndustry } from './IndustryProvider';
import { Industry } from '@/lib/types';
import Backdrop from './visual/Backdrop';
import Reveal from './visual/Reveal';

interface Point {
  title: string;
  detail: string;
}

const SHARED: Point[] = [
  {
    title: 'Certified Technicians',
    detail: 'Every technician is factory-trained on the coating systems we install.',
  },
  {
    title: 'Premium Products',
    detail:
      'We use professional-grade coatings and compounds, matched to the surface rather than sold by the bottle.',
  },
  {
    title: 'Fully Insured',
    // Was "&amp;" written literally into a JS string in the previous version,
    // which rendered the entity as visible text.
    detail: 'Comprehensive coverage protects your property from arrival to handover.',
  },
];

const BY_INDUSTRY: Record<Industry, Point[]> = {
  automotive: [
    {
      title: 'Luxury & Exotic Specialists',
      detail:
        'Daily experience with the paint systems used by Ferrari, Porsche, Lamborghini, and McLaren.',
    },
    {
      title: 'Climate-Controlled Shop',
      detail: 'Every service is performed indoors, in a filtered, temperature-controlled bay.',
    },
    {
      title: 'Correction-First Approach',
      detail:
        'We correct before we protect — a coating over unprepared paint locks the defects in.',
    },
  ],
  marine: [
    {
      title: 'Salt & UV Systems',
      detail:
        'Products selected for constant salt exposure and full-sun mooring, not adapted from automotive lines.',
    },
    {
      title: 'We Come To The Slip',
      detail: 'Dockside and in-yard service, so your vessel never has to leave the water for us.',
    },
    {
      title: 'Gelcoat Expertise',
      detail:
        'Oxidation and chalking need compounding judgement — too aggressive and you lose gelcoat you cannot replace.',
    },
  ],
  aviation: [
    {
      title: 'Approved Products Only',
      detail:
        'Aviation-approved chemistry throughout — many consumer products attack acrylic windows and painted skin.',
    },
    {
      title: 'FBO & Hangar Access',
      detail: 'Insured and badged for ramp work, scheduled around your flight department.',
    },
    {
      title: 'Dry Wash Capable',
      detail:
        'Full waterless service for ramps and hangars where run-off is restricted or water is unavailable.',
    },
  ],
};

export default function WhyChooseUs() {
  const { industry } = useIndustry();
  const points = [...BY_INDUSTRY[industry], ...SHARED];

  return (
    <section id="about" className="relative overflow-hidden bg-charcoal/40 py-20 sm:py-28">
      {/* `photo={false}` — this section is a wall of body copy at `text-muted`,
          and a ghosted photograph behind six paragraphs is where contrast goes
          to die. Texture and mesh give it depth without lifting the background
          luminance the palette was measured against. */}
      <Backdrop industry={industry} photo={false} intensity="subtle" />

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <Reveal className="mb-10 max-w-xl sm:mb-14">
          <p className="eyebrow mb-4">Why Mount Olympus</p>
          <h2 className="text-gradient font-display text-3xl font-bold tracking-tightest sm:text-5xl">
            Craftsmanship, not shortcuts.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((p, i) => (
            <Reveal
              key={p.title}
              as="article"
              delay={i * 70}
              className="gradient-border lift group relative flex flex-col rounded-md border border-white/10 bg-obsidian/40 p-6 sm:p-7"
            >
              <div className="flex items-baseline gap-3">
                <p className="font-mono text-[11px] uppercase tracking-widest2 text-flare">
                  {String(i + 1).padStart(2, '0')}
                </p>
                {/* Rule grows on hover via scaleX — a transform, so it composites
                    rather than triggering layout the way animating width would. */}
                <span
                  aria-hidden="true"
                  className="h-px flex-1 origin-left scale-x-0 bg-gradient-to-r from-apex/70 to-transparent transition-transform duration-500 ease-apex group-hover:scale-x-100 group-focus-within:scale-x-100"
                />
              </div>

              <h3 className="mt-3 font-display text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.detail}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

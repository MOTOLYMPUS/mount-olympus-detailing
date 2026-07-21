'use client';

import { motion } from 'framer-motion';
import { useIndustry } from './IndustryProvider';
import { usePrefersReducedMotion } from '@/lib/useDialog';
import { Industry } from '@/lib/types';

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
  const reduced = usePrefersReducedMotion();
  const points = [...BY_INDUSTRY[industry], ...SHARED];

  return (
    <section id="about" className="border-t border-white/10 bg-charcoal/40 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-10 max-w-xl sm:mb-14">
          <p className="eyebrow mb-4">Why Mount Olympus</p>
          <h2 className="font-display text-3xl font-bold tracking-tightest sm:text-5xl">
            Craftsmanship, not shortcuts.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((p, i) => (
            <motion.div
              key={p.title}
              initial={reduced ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : i * 0.05 }}
            >
              <p className="font-mono text-[11px] uppercase tracking-widest2 text-apex">
                {String(i + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-3 font-display text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.detail}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

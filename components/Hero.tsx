'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { useIndustry } from './IndustryProvider';
import IndustrySelector from './IndustrySelector';
import { usePrefersReducedMotion } from '@/lib/useDialog';

export default function Hero({ onStartEstimate }: { onStartEstimate: () => void }) {
  const { config, industry } = useIndustry();
  const reduced = usePrefersReducedMotion();

  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] w-full flex-col justify-end overflow-hidden"
    >
      {/* Background image.
          Uses next/image with `priority` + `fill` rather than a CSS
          background-image: this is the LCP element, and the old approach
          shipped one unresponsive 2400px JPEG with no format negotiation. */}
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

        {/* Scrims. Strong enough that the headline clears AA contrast over any
            part of the photograph. */}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/55 to-obsidian/75" />
        <div className="absolute inset-0 bg-gradient-to-r from-obsidian/80 via-obsidian/20 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-6 pb-12 pt-32 sm:pb-16 lg:gap-14 lg:px-10 lg:pb-20 lg:pt-40">
        <motion.div
          key={`copy-${industry}`}
          initial={reduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <p className="eyebrow mb-4 text-muted">{config.eyebrow}</p>

          <h1 className="font-display text-[15vw] font-bold leading-[0.95] tracking-tightest sm:text-[58px] lg:text-[76px]">
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
    </section>
  );
}

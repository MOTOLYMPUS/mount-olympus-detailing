'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { IndustryProvider } from '@/components/IndustryProvider';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import EstimateCalculator from '@/components/EstimateCalculator';
import ServicesGrid from '@/components/ServicesGrid';
import Gallery from '@/components/Gallery';
import Reviews from '@/components/Reviews';
import WhyChooseUs from '@/components/WhyChooseUs';
import Footer from '@/components/Footer';
import type { EstimatePrefill } from '@/components/EstimateFlow/EstimateModal';

// The wizard and its five steps are only needed once someone opens it — keeping
// them out of the initial bundle. `ssr: false` is safe here because the modal
// renders nothing until `open` is true.
const EstimateModal = dynamic(() => import('@/components/EstimateFlow/EstimateModal'), {
  ssr: false,
});

export default function Home() {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<EstimatePrefill>({});

  const openEstimate = useCallback((p: EstimatePrefill = {}) => {
    setPrefill(p);
    setOpen(true);
  }, []);

  return (
    <IndustryProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <Navbar onGetEstimate={() => openEstimate()} />

      {/* ── Section rhythm ──────────────────────────────────────────────────
          Each section below owns its own <Backdrop>, so continuity is a matter
          of alternating what those backdrops emphasise rather than stacking
          more decoration here:

            Hero              full photographic layering (see Hero.tsx)
            Calculator        texture + mesh, NO photo — it is a form
            Services          ghosted photo, subtle — cards carry the imagery
            Gallery           ghosted photo, subtle
            WhyChooseUs       texture + mesh, NO photo — dense body copy
            Reviews           brushed texture, NO photo
            Footer            mountain silhouette

          The photo-bearing backdrops are deliberately NOT adjacent, so the page
          breathes between them instead of reading as one long wash.

          Every seam is a `.hairline-glow` — a 1px gradient with an apex bloom in
          the centre, replacing the flat `border-t border-white/10` each section
          used to draw for itself. It is one element per seam, purely decorative,
          and inert to pointer and assistive tech.

          Industry switching is coherent across all of this because every one of
          these sections reads `useIndustry()` and re-renders together: hero
          photo, backdrop photo, texture, services, gallery filter, and copy all
          change in the same commit. Nothing here needs to orchestrate it. */}
      <main id="main" className="pb-20 lg:pb-0">
        <Hero onStartEstimate={() => openEstimate()} />

        <SectionSeam />

        <EstimateCalculator
          onRequest={({ sizeClass, serviceIds, addOnIds }) =>
            openEstimate({ sizeClass, serviceIds, addOnIds })
          }
        />

        <SectionSeam />

        <ServicesGrid onBook={(serviceId) => openEstimate({ serviceIds: [serviceId] })} />

        <SectionSeam />

        <Gallery />

        <SectionSeam />

        <WhyChooseUs />

        <SectionSeam />

        <Reviews />
      </main>

      <Footer />

      {/* Mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-obsidian/95 p-4 backdrop-blur-md lg:hidden">
        <button onClick={() => openEstimate()} className="btn-apex w-full">
          Get My Estimate
        </button>
      </div>

      <EstimateModal open={open} onClose={() => setOpen(false)} prefill={prefill} />
    </IndustryProvider>
  );
}

/**
 * Section divider. Decorative, so `aria-hidden` — a screen reader announcing
 * five separators between landmark sections is noise, and the sections are
 * already delimited semantically by their headings.
 */
function SectionSeam() {
  return (
    <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10" aria-hidden="true">
      <div className="hairline-glow" />
    </div>
  );
}

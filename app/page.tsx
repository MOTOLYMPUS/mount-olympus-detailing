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

      <main id="main" className="pb-20 lg:pb-0">
        <Hero onStartEstimate={() => openEstimate()} />

        <EstimateCalculator
          onRequest={({ sizeClass, serviceIds, addOnIds }) =>
            openEstimate({ sizeClass, serviceIds, addOnIds })
          }
        />

        <ServicesGrid onBook={(serviceId) => openEstimate({ serviceIds: [serviceId] })} />

        <Gallery />
        <WhyChooseUs />
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

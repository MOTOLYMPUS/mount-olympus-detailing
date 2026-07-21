'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import EstimateCalculator from '@/components/EstimateCalculator';
import ServicesGrid from '@/components/ServicesGrid';
import Gallery from '@/components/Gallery';
import Reviews from '@/components/Reviews';
import WhyChooseUs from '@/components/WhyChooseUs';
import Footer from '@/components/Footer';
import BookingModal, { BookingPrefill } from '@/components/BookingFlow/BookingModal';
import { ServiceId, VehicleSize } from '@/lib/types';

export default function Home() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [prefill, setPrefill] = useState<BookingPrefill>({});

  const openBooking = (p: BookingPrefill = {}) => {
    setPrefill(p);
    setBookingOpen(true);
  };

  return (
    <main className="pb-20 lg:pb-0">
      <Navbar onBookNow={() => openBooking()} />

      <Hero
        onOpenBooking={(p) => openBooking(p)}
      />

      <EstimateCalculator
        onBook={(services: ServiceId[], size: VehicleSize) =>
          openBooking({ serviceId: services[0] })
        }
      />

      <ServicesGrid onBook={(serviceId) => openBooking({ serviceId })} />

      <Gallery />

      <WhyChooseUs />

      <Reviews />

      <Footer />

      {/* Mobile sticky Book Now bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-obsidian/95 p-4 backdrop-blur-md lg:hidden">
        <button onClick={() => openBooking()} className="btn-apex w-full">
          Book Now
        </button>
      </div>

      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} prefill={prefill} />
    </main>
  );
}

'use client';

import { motion } from 'framer-motion';
import BookingCard from './BookingCard';

interface Props {
  onOpenBooking: (prefill: { make: string; model: string; year: string; serviceId: string }) => void;
}

export default function Hero({ onOpenBooking }: Props) {
  return (
    <section id="top" className="relative flex min-h-[100svh] w-full items-end overflow-hidden">
      {/* Background image layer */}
      <div className="absolute inset-0">
        <motion.div
          initial={{ scale: 1.08 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
          className="h-full w-full bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=2400&auto=format&fit=crop')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/30 to-obsidian/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-obsidian/60 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-14 px-6 pb-16 pt-40 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-xl"
        >
          <p className="eyebrow mb-5">Paint Correction · Ceramic · PPF</p>
          <h1 className="font-display text-[13vw] font-bold leading-[0.95] tracking-tightest sm:text-[64px] lg:text-[76px]">
            Perfection,
            <br />
            Preserved.
          </h1>
          <p className="mt-6 max-w-md font-body text-base leading-relaxed text-smoke/75">
            Luxury detailing, ceramic coatings, paint correction, and protection for vehicles
            that deserve nothing less.
          </p>
        </motion.div>

        <div className="w-full lg:w-auto">
          <BookingCard onOpenBooking={onOpenBooking} />
        </div>
      </div>
    </section>
  );
}

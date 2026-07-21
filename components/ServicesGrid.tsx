'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { services, luxuryPackage } from '@/data/services';
import { formatCurrency } from '@/lib/pricing';

export default function ServicesGrid({ onBook }: { onBook: (serviceId: string) => void }) {
  return (
    <section id="services" className="border-t border-white/10 py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-14 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="eyebrow mb-4">Services</p>
            <h2 className="font-display text-4xl font-bold tracking-tightest sm:text-5xl">
              Every finish, done to concours standard.
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc, i) => (
            <motion.div
              key={svc.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: (i % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="group relative flex flex-col bg-obsidian"
            >
              <div className="relative h-56 w-full overflow-hidden">
                <Image
                  src={svc.image}
                  alt={svc.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform duration-700 ease-apex group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-obsidian/80 to-transparent" />
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-display text-lg font-bold text-white">{svc.name}</h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-smoke/60">
                  {svc.shortDescription}
                </p>

                <div className="hairline my-5" />

                <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-widest2 text-smoke/50">
                  <span>{svc.estimatedHours} hrs est.</span>
                  <span className="text-white">From {formatCurrency(svc.startingPrice)}</span>
                </div>

                <button
                  onClick={() => onBook(svc.id)}
                  className="btn-ghost mt-5 w-full text-[11px]"
                >
                  Book Now
                </button>
              </div>
            </motion.div>
          ))}

          {/* Luxury package — spans full width as the flagship offer */}
          <div className="relative flex flex-col justify-between gap-6 bg-charcoal p-8 sm:col-span-2 lg:col-span-3 lg:flex-row lg:items-center">
            <div>
              <p className="eyebrow mb-3">Flagship</p>
              <h3 className="font-display text-2xl font-bold text-white">{luxuryPackage.name}</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-smoke/60">
                {luxuryPackage.description}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <span className="font-mono text-2xl text-white">
                From {formatCurrency(luxuryPackage.startingPrice)}
              </span>
              <button onClick={() => onBook('luxury-package')} className="btn-apex whitespace-nowrap">
                Book Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

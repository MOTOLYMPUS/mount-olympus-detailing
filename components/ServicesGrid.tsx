'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { useIndustry } from './IndustryProvider';
import { servicesForIndustry } from '@/data/pricing';
import { formatCurrency, startingPrice } from '@/lib/pricing';
import { usePrefersReducedMotion } from '@/lib/useDialog';

export default function ServicesGrid({ onBook }: { onBook: (serviceId: string) => void }) {
  const { industry, config } = useIndustry();
  const reduced = usePrefersReducedMotion();
  const services = servicesForIndustry(industry);

  return (
    <section id="services" className="border-t border-white/10 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-10 max-w-xl sm:mb-14">
          <p className="eyebrow mb-4">{config.label} Services</p>
          <h2 className="font-display text-3xl font-bold tracking-tightest sm:text-5xl">
            {config.sectionHeading}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc, i) => (
            <motion.article
              key={svc.id}
              initial={reduced ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : (i % 3) * 0.07 }}
              className="group relative flex flex-col bg-obsidian"
            >
              <div className="relative h-52 w-full overflow-hidden">
                <Image
                  src={svc.image}
                  alt=""
                  fill
                  loading="lazy"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 ease-apex group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-obsidian/85 to-transparent" />
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-display text-lg font-bold text-white">{svc.name}</h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">
                  {svc.shortDescription}
                </p>

                {svc.includes && svc.includes.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-1.5">
                    {svc.includes.slice(0, 4).map((item) => (
                      <li key={item} className="flex gap-2 text-[12px] leading-snug text-subtle">
                        <span aria-hidden="true" className="text-apex">
                          ·
                        </span>
                        {item}
                      </li>
                    ))}
                    {svc.includes.length > 4 && (
                      <li className="text-[12px] text-subtle">
                        + {svc.includes.length - 4} more
                      </li>
                    )}
                  </ul>
                )}

                <div className="hairline my-5" />

                <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-widest2 text-muted">
                  <span>{svc.estimatedHours} hrs est.</span>
                  <span className="text-white">From {formatCurrency(startingPrice(svc))}</span>
                </div>

                <button
                  onClick={() => onBook(svc.id)}
                  className="btn-ghost mt-5 w-full text-[11px]"
                >
                  Get Estimate
                  <span className="sr-only"> for {svc.name}</span>
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

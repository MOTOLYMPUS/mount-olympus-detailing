'use client';

import { motion } from 'framer-motion';

const POINTS = [
  {
    title: 'Certified Installers',
    detail: 'Every technician is factory-trained on the ceramic and film systems we install.',
  },
  {
    title: 'Premium Products',
    detail: 'We use the same coatings and films trusted by manufacturer-certified restoration shops.',
  },
  {
    title: 'Luxury &amp; Exotic Specialists',
    detail: 'Daily experience with Ferrari, Porsche, Lamborghini, and McLaren-specific paint systems.',
  },
  {
    title: 'Climate-Controlled Shop',
    detail: 'Every service is performed indoors, in a filtered, temperature-controlled bay.',
  },
  {
    title: 'Fully Insured',
    detail: 'Comprehensive garage-keepers coverage protects your vehicle from arrival to pickup.',
  },
  {
    title: 'Experienced Technicians',
    detail: 'Years of hands-on work exclusively on high-value performance and exotic vehicles.',
  },
];

export default function WhyChooseUs() {
  return (
    <section id="about" className="border-t border-white/10 bg-charcoal/40 py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-14 max-w-xl">
          <p className="eyebrow mb-4">Why Apex</p>
          <h2 className="font-display text-4xl font-bold tracking-tightest sm:text-5xl">
            Craftsmanship, not shortcuts.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {POINTS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
            >
              <p className="font-mono text-[11px] uppercase tracking-widest2 text-apex">
                {String(i + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-3 font-display text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-smoke/60">{p.detail}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

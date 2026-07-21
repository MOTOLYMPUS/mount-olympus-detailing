'use client';

import { motion } from 'framer-motion';
import { reviews, googleRating } from '@/data/reviews';

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 text-apex">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill={i < count ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

export default function Reviews() {
  return (
    <section id="reviews" className="border-t border-white/10 py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-14 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="eyebrow mb-4">Reviews</p>
            <h2 className="font-display text-4xl font-bold tracking-tightest sm:text-5xl">
              Trusted by owners who notice everything.
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Stars count={5} />
            <span className="font-mono text-sm text-white">
              {googleRating.average.toFixed(1)} · {googleRating.count} Google Reviews
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {reviews.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="rounded-md border border-white/10 bg-charcoal/30 p-8"
            >
              <Stars count={r.rating} />
              <p className="mt-5 text-[15px] leading-relaxed text-white/85">&ldquo;{r.quote}&rdquo;</p>
              <div className="hairline my-6" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{r.name}</p>
                  <p className="text-xs text-smoke/50">{r.location}</p>
                </div>
                <p className="font-mono text-[11px] uppercase tracking-widest2 text-smoke/50">
                  {r.vehicle}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

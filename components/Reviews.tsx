'use client';

import { motion } from 'framer-motion';
import { reviews, googleRating } from '@/data/reviews';
import { usePrefersReducedMotion } from '@/lib/useDialog';

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 text-apex" role="img" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={i < count ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

export default function Reviews() {
  const reduced = usePrefersReducedMotion();

  // Renders nothing until real, verified reviews exist. See data/reviews.ts for
  // why the previous fabricated testimonials were removed.
  if (reviews.length === 0) return null;

  return (
    <section id="reviews" className="border-t border-white/10 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-10 flex flex-col justify-between gap-6 sm:mb-14 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="eyebrow mb-4">Reviews</p>
            <h2 className="font-display text-3xl font-bold tracking-tightest sm:text-5xl">
              Trusted by owners who notice everything.
            </h2>
          </div>

          {googleRating && (
            <div className="flex items-center gap-3">
              <Stars count={Math.round(googleRating.average)} />
              <span className="font-mono text-sm text-white">
                {googleRating.average.toFixed(1)} · {googleRating.count} Google Reviews
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {reviews.map((r, i) => (
            <motion.figure
              key={r.id}
              initial={reduced ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : i * 0.07 }}
              className="rounded-md border border-white/10 bg-charcoal/30 p-6 sm:p-8"
            >
              <Stars count={r.rating} />
              <blockquote className="mt-5 text-[15px] leading-relaxed text-white/90">
                &ldquo;{r.quote}&rdquo;
              </blockquote>
              <div className="hairline my-6" />
              <figcaption className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">{r.name}</p>
                  <p className="text-xs text-subtle">{r.location}</p>
                </div>
                <p className="font-mono text-[11px] uppercase tracking-widest2 text-muted">
                  {r.vehicle}
                </p>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}

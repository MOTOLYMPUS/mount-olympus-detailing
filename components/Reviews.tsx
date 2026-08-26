'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Reviews.
//
// data/reviews.ts ships EMPTY on purpose — it previously carried four invented
// testimonials and a hardcoded "5.0 · 214 Google Reviews" badge. Publishing
// fabricated reviews or a false aggregate rating is a violation of the FTC Rule
// on Consumer Reviews and Testimonials (16 CFR Part 465), with civil penalties
// per violation.
//
// The previous component returned `null` while the array was empty. That was
// safe but it left a hole in the page and, worse, it gave the next person to
// touch this file no explanation for the gap — the fastest way to get the fake
// reviews quietly restored.
//
// So this now renders a designed, honest invitation instead: it says plainly
// that reviews are published only once real customers leave them, and it points
// at the two things a visitor can actually do. Every piece of the real layout —
// the Stars component, the rating badge, the card grid — is retained below and
// lights up the moment `reviews` has entries.
// ─────────────────────────────────────────────────────────────────────────────

import { reviews, googleRating } from '@/data/reviews';
import { business } from '@/lib/business';
import Backdrop from './visual/Backdrop';
import Reveal from './visual/Reveal';
import { useIndustry } from './IndustryProvider';

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 text-flare" role="img" aria-label={`${count} out of 5 stars`}>
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
  const { industry } = useIndustry();
  const hasReviews = reviews.length > 0;

  return (
    <section id="reviews" className="relative overflow-hidden py-20 sm:py-28">
      <Backdrop industry={industry} photo={false} texture="brushed" intensity="subtle" />

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <Reveal className="mb-10 flex flex-col justify-between gap-6 sm:mb-14 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <p className="eyebrow mb-4">Reviews</p>
            <h2 className="text-gradient font-display text-3xl font-bold tracking-tightest sm:text-5xl">
              Trusted by owners who notice everything.
            </h2>
          </div>

          {/* Renders only against a verified figure. Null hides it — see
              data/reviews.ts. Never hardcode a number here. */}
          {googleRating && (
            <div className="glass flex items-center gap-3 rounded-sm px-4 py-2.5">
              <Stars count={Math.round(googleRating.average)} />
              <span className="font-mono text-sm text-white">
                {googleRating.average.toFixed(1)} · {googleRating.count} Google Reviews
              </span>
            </div>
          )}
        </Reveal>

        {hasReviews ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {reviews.map((r, i) => (
              <Reveal
                key={r.id}
                as="article"
                delay={Math.min(i, 6) * 70}
                className="gradient-border lift relative rounded-md border border-white/10 bg-obsidian/40 p-6 sm:p-8"
              >
                <figure>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-6 top-4 font-display text-6xl leading-none text-white/[0.06]"
                  >
                    &rdquo;
                  </span>

                  <Stars count={r.rating} />
                  <blockquote className="mt-5 text-[15px] leading-relaxed text-white/90">
                    &ldquo;{r.quote}&rdquo;
                  </blockquote>
                  <div className="hairline-glow my-6" />
                  <figcaption className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">{r.name}</p>
                      <p className="text-xs text-subtle">{r.location}</p>
                    </div>
                    <p className="font-mono text-[11px] uppercase tracking-widest2 text-muted">
                      {r.vehicle}
                    </p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        ) : (
          <ReviewsEmptyState />
        )}
      </div>
    </section>
  );
}

/**
 * The empty state.
 *
 * Deliberately NOT a placeholder card that mimics a review. Anything shaped
 * like a testimonial — even greyed out, even labelled "example" — trains the
 * eye to read it as one and is one careless commit away from becoming real
 * copy. This is a statement of policy plus two live actions, in a layout that
 * shares nothing with the review card above.
 */
function ReviewsEmptyState() {
  return (
    <Reveal direction="scale">
      <div className="gradient-border relative overflow-hidden rounded-md border border-white/10 bg-obsidian/40">
        <div className="layer tex-hex opacity-50" aria-hidden="true" />
        <div className="layer mesh-gradient opacity-40" aria-hidden="true" />
        <div className="layer bg-gradient-to-b from-transparent to-obsidian/70" aria-hidden="true" />
        <div className="layer tex-noise" aria-hidden="true" />

        <div className="relative grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-14">
          <div>
            <span
              aria-hidden="true"
              className="mb-6 flex h-12 w-12 items-center justify-center rounded-sm border border-white/20 text-white/70"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.9-.9L3 20.5l1.6-4.6A8.4 8.4 0 013.6 11.5a8.4 8.4 0 018.4-8.4h.5a8.4 8.4 0 018.5 8.4z" />
              </svg>
            </span>

            <h3 className="font-display text-2xl font-bold tracking-tightest text-white sm:text-3xl">
              No reviews published yet — and we won&rsquo;t invent any.
            </h3>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
              This space stays empty until real customers leave real feedback.
              We publish reviews verbatim, with the customer&rsquo;s permission,
              and we never post a rating we can&rsquo;t point you to on our
              Google Business Profile.
            </p>
            <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-subtle">
              If we have worked on your vehicle, vessel, or aircraft, we would
              genuinely like to hear how it held up.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a href={`mailto:${business.email}?subject=Feedback`} className="btn-apex text-[11px]">
                Send Us Feedback
              </a>
              <a href="#services" className="btn-ghost text-[11px]">
                View Services
              </a>
            </div>
          </div>

          {/* Three commitments — this is the trust content that a fabricated
              testimonial block was previously standing in for. Every line is a
              statement about how we behave, which we can honour, rather than a
              claim about outcomes we would have to substantiate. */}
          <ul className="flex flex-col gap-px overflow-hidden rounded-sm bg-white/10">
            {[
              ['Verbatim only', 'Quoted exactly as written. Nothing edited for polish.'],
              ['Permission first', 'Published only with the reviewer’s consent.'],
              ['Nothing filtered', 'Critical reviews stay up alongside the good ones.'],
            ].map(([title, detail]) => (
              <li key={title} className="bg-obsidian/80 p-5">
                <p className="font-mono text-[10px] uppercase tracking-widest2 text-flare">{title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  REVIEWS — EMPTIED DELIBERATELY. READ BEFORE REPOPULATING.
//
// This file previously shipped four invented customer testimonials and a
// hardcoded "5.0 · 214 Google Reviews" badge. Publishing fabricated reviews or
// a false aggregate rating violates the FTC Rule on Consumer Reviews and
// Testimonials (16 CFR Part 465, in force since October 2024), which carries
// civil penalties per violation. It is also straightforwardly dishonest to the
// customer.
//
// The invented content has been removed rather than restyled. The Reviews
// section now renders nothing at all while this array is empty, so the site is
// launch-safe by default.
//
// TO REPOPULATE, use only:
//   • Reviews genuinely left by real customers, quoted accurately, with their
//     permission to republish.
//   • A `googleRating` that matches the live Google Business Profile figure. If
//     you cannot verify it, leave it null — the badge hides itself.
// ─────────────────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  name: string;
  location: string;
  vehicle: string;
  rating: number;
  quote: string;
}

export const reviews: Review[] = [];

/** Set to a real, verified figure or leave as null. Null hides the badge. */
export const googleRating: { average: number; count: number } | null = null;

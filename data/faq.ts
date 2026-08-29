// ─────────────────────────────────────────────────────────────────────────────
// Detailing FAQ — the content behind the free in-app advisor.
//
// ⚠️ HONESTY CONSTRAINT (same one that emptied data/reviews.ts):
// answers here must not make durability guarantees, quote fixed prices, or
// invent specifics the business has not committed to. Pricing always defers to
// the live estimate ("confirmed after inspection"), because the price tables in
// data/pricing/ are the single source of truth and an answer that hardcodes a
// number would drift the moment those change.
//
// This is static data, rendered inside a server component with native
// <details>/<summary>. It ships ZERO JavaScript and makes ZERO API calls — the
// whole reason it replaced the paid LLM chat.
// ─────────────────────────────────────────────────────────────────────────────

import { Industry } from '@/lib/types';

export interface FaqItem {
  q: string;
  a: string;
  /** Omitted = shown for every industry. */
  industry?: Industry;
}

export interface FaqGroup {
  id: string;
  title: string;
  items: FaqItem[];
}

export const faqGroups: FaqGroup[] = [
  {
    id: 'choosing',
    title: 'Choosing a service',
    items: [
      {
        q: 'What is the difference between a wash, a detail, and a correction?',
        a: 'A wash cleans the surface. A full detail deep-cleans inside and out — decontamination, interior extraction, protection. Paint correction is a separate step that machine-polishes out swirls and scratches before any coating goes on. Most people start with a full detail; correction is added when the paint has visible defects.',
      },
      {
        q: 'Do I need paint correction before a ceramic coating?',
        a: 'Usually, yes. A coating locks in whatever is underneath it, so any swirls or scratches present when it is applied stay sealed under it. Correcting first is what makes a coating look its best and is why the two are often booked together. We confirm what your paint actually needs at inspection.',
      },
      {
        q: 'How do I know which size or category to pick?',
        a: 'Pick the closest match — a two-row vs. three-row SUV, a boat by its length, an aircraft by its class. Pricing is banded, so the exact figure follows the category you choose. If you are unsure, choose the nearer one and add a note; we confirm before any work begins.',
      },
      {
        q: 'What is the clay bar / decontamination add-on for?',
        a: 'Washing removes what sits on top of the paint. Decontamination removes what has bonded into it — embedded iron, industrial fallout, overspray — that you can feel as roughness. It makes a real difference before polishing or coating, which is why it is offered as an add-on on those services.',
      },
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing & estimates',
    items: [
      {
        q: 'Is the price I see online the final price?',
        a: 'It is a real estimate from our own price list, not a guess — but it is confirmed after a quick look at the vehicle. Heavier contamination, deep correction work, or pet hair and heavy soiling can adjust it. We always tell you before starting, never after.',
      },
      {
        q: 'Do I pay when I request an estimate?',
        a: 'No. Requesting an estimate costs nothing and commits you to nothing. We follow up to confirm the details and a time that works for you.',
      },
      {
        q: 'Can I combine services?',
        a: 'Yes — select as many as you like and the estimate updates instantly. Combining related work in one visit (for example correction plus a coating) is usually the most efficient way to book it.',
      },
    ],
  },
  {
    id: 'booking',
    title: 'Booking & logistics',
    items: [
      {
        q: 'How long will my vehicle take?',
        a: 'Each service shows an estimated time, and your estimate totals them for the work you selected. A wash is a few hours; a full correction and coating can run across more than one day. We give you a firm window when we confirm.',
      },
      {
        q: 'Do you come to me?',
        a: 'We offer mobile service by appointment for much of our work. Some services — heavy correction, coatings that need a controlled environment — are best done at a fixed location. Tell us where the vehicle is in your request and we will sort the right option.',
        industry: 'automotive',
      },
      {
        q: 'Can you service my boat in the water or on the trailer?',
        a: 'Both are common. Tell us whether it is in a slip, on a lift, or trailered, and roughly where, in your request notes — access changes how we schedule and quote it.',
        industry: 'marine',
      },
      {
        q: 'Do you have ramp and hangar access?',
        a: 'Aircraft work is arranged around your flight department and the FBO. Approved products only, and we schedule to fit your availability. Add the tail location and any access requirements to your request and we will coordinate.',
        industry: 'aviation',
      },
      {
        q: 'How do I keep the finish looking good between visits?',
        a: 'A maintenance wash on a regular schedule is the single biggest thing. It keeps protection topped up and stops contamination bonding in, which is what forces the bigger jobs later. Save your vehicle to your garage and we can remind you when it is due.',
      },
    ],
  },
];

/** FAQ filtered to one industry: shared items plus that industry's own. */
export function faqForIndustry(industry: Industry | undefined): FaqGroup[] {
  return faqGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.industry || i.industry === industry),
    }))
    .filter((g) => g.items.length > 0);
}

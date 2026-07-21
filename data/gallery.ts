// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  GALLERY — BEFORE/AFTER PAIRS EMPTIED DELIBERATELY.
//
// The previous version faked its before/after comparisons: each pair pointed at
// the SAME Unsplash photo twice, with `&sat=-100&con=-10` appended to the
// "before" URL to desaturate it. That presents a colour filter as a record of
// work performed — a false claim about results, and specifically risky for a
// business selling paint correction on visible outcomes.
//
// The comparison slider hides itself while `galleryPairs` is empty.
//
// TO REPOPULATE: use genuine photographs of the same vehicle before and after
// real work, shot in comparable light and angle. Put the files in /public and
// reference them by path.
// ─────────────────────────────────────────────────────────────────────────────

import { serviceImages } from './media';

export interface GalleryPair {
  id: string;
  label: string;
  before: string;
  after: string;
}

export const galleryPairs: GalleryPair[] = [];

/**
 * Grid imagery. Still third-party stock — see data/media.ts. Replace with your
 * own work as soon as you have it; this is the section customers scrutinise.
 */
export const galleryGrid: { src: string; alt: string }[] = [
  { src: serviceImages.autoFullDetail, alt: 'A dark sports car after a full exterior detail' },
  { src: serviceImages.autoInterior, alt: 'A cleaned and conditioned leather car interior' },
  { src: serviceImages.marineFullDetail, alt: 'A motor yacht with freshly polished topsides' },
  { src: serviceImages.marineWash, alt: 'A boat being washed down at the dock' },
  { src: serviceImages.aviationWetWash, alt: 'A business jet exterior after washing' },
  { src: serviceImages.aviationCabin, alt: 'A private aircraft cabin after an interior detail' },
];

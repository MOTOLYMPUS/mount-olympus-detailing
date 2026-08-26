// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  GALLERY — BEFORE/AFTER PAIRS EMPTIED DELIBERATELY.
//
// The previous version faked its before/after comparisons: each pair pointed at
// the SAME Unsplash photo twice, with `&sat=-100&con=-10` appended to the
// "before" URL to desaturate it. That presents a colour filter as a record of
// work performed — a false claim about results, and specifically risky for a
// business selling paint correction on visible outcomes.
//
// The comparison slider hides itself while `galleryPairs` is empty and renders
// an honest "photography in progress" panel in its place. Drop real pairs in
// here and the slider lights up with no other code change.
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

// ─────────────────────────────────────────────────────────────────────────────
// MOSAIC IMAGERY
//
// ⚠️ These are third-party stock photographs (see data/media.ts), NOT this
// business's work. That constrains two things and they are not negotiable:
//
//   1. Every `alt` below describes ONLY what the photograph shows. None of them
//      says "our", "we", "this customer", or names a result we produced. The
//      section that renders them is captioned "Reference gallery" for the same
//      reason — a caption is a claim, and this one has to stay true.
//   2. Every `src` reuses an id already present in data/media.ts. Guessed
//      Unsplash ids 404'd during the first pass, so new ones are never invented
//      here; run `node scripts/check-images.mjs` after any change.
//
// `shape` exists so the mosaic can vary tile height WITHOUT measuring anything
// at runtime. Each shape maps to a fixed aspect-ratio class in Gallery.tsx, so
// the browser reserves the exact box before the image decodes and cumulative
// layout shift for this section is zero.
// ─────────────────────────────────────────────────────────────────────────────

export type GalleryCategory = 'automotive' | 'marine' | 'aviation';
export type GalleryShape = 'square' | 'portrait' | 'wide';

export interface GalleryItem {
  id: string;
  src: string;
  alt: string;
  category: GalleryCategory;
  /** Short overlay label. Descriptive of the subject, never of work performed. */
  caption: string;
  shape: GalleryShape;
}

export const galleryCategories: { id: GalleryCategory; label: string }[] = [
  { id: 'automotive', label: 'Automotive' },
  { id: 'marine', label: 'Marine' },
  { id: 'aviation', label: 'Aviation' },
];

export const galleryGrid: GalleryItem[] = [
  // ── Automotive ─────────────────────────────────────────────────────────────
  {
    id: 'auto-full',
    src: serviceImages.autoFullDetail,
    alt: 'A dark sports car photographed in profile with a high-gloss paint finish',
    category: 'automotive',
    caption: 'Gloss finish',
    shape: 'wide',
  },
  {
    id: 'auto-interior',
    src: serviceImages.autoInterior,
    alt: 'The leather interior of a car, seats and console clean and conditioned',
    category: 'automotive',
    caption: 'Interior surfaces',
    shape: 'square',
  },
  {
    id: 'auto-wash',
    src: serviceImages.autoExteriorWash,
    alt: 'A car being hand washed, foam covering the bodywork',
    category: 'automotive',
    caption: 'Hand wash',
    shape: 'portrait',
  },
  {
    id: 'auto-correction',
    src: serviceImages.autoPaintCorrection,
    alt: 'Close view of a car body panel with reflections running along the paint',
    category: 'automotive',
    caption: 'Paint depth',
    shape: 'square',
  },
  {
    id: 'auto-ceramic',
    src: serviceImages.autoCeramic,
    alt: 'Water beading on a coated vehicle panel',
    category: 'automotive',
    caption: 'Hydrophobic beading',
    shape: 'portrait',
  },
  {
    id: 'auto-motorcycle',
    src: serviceImages.motorcycle,
    alt: 'A motorcycle photographed in profile, chrome and paintwork catching the light',
    category: 'automotive',
    caption: 'Two wheels',
    shape: 'square',
  },
  {
    id: 'auto-motorcycle-oem',
    src: serviceImages.motorcycleOem,
    alt: 'Detail view of a motorcycle tank and engine casing',
    category: 'automotive',
    caption: 'Component detail',
    shape: 'square',
  },

  // ── Marine ─────────────────────────────────────────────────────────────────
  {
    id: 'marine-full',
    src: serviceImages.marineFullDetail,
    alt: 'A motor yacht moored with polished topsides',
    category: 'marine',
    caption: 'Topsides',
    shape: 'wide',
  },
  {
    id: 'marine-wash',
    src: serviceImages.marineWash,
    alt: 'A boat being washed down alongside a dock',
    category: 'marine',
    caption: 'Dockside wash',
    shape: 'square',
  },
  {
    id: 'marine-hull',
    src: serviceImages.marineHull,
    alt: 'The hull of a vessel viewed at the waterline',
    category: 'marine',
    caption: 'Hull and waterline',
    shape: 'portrait',
  },
  {
    id: 'marine-ceramic',
    src: serviceImages.marineCeramic,
    alt: 'A performance motor yacht underway on open water',
    category: 'marine',
    caption: 'Underway',
    shape: 'square',
  },
  {
    id: 'marine-cabin',
    src: serviceImages.marineCabin,
    alt: 'The interior cabin of a boat, upholstery and joinery in view',
    category: 'marine',
    caption: 'Cabin interior',
    shape: 'portrait',
  },

  // ── Aviation ───────────────────────────────────────────────────────────────
  {
    id: 'aviation-paint',
    src: serviceImages.aviationPaint,
    alt: 'A private business jet on an airport apron at dusk, viewed from the nose',
    category: 'aviation',
    caption: 'On the ramp',
    shape: 'wide',
  },
  {
    id: 'aviation-wet',
    src: serviceImages.aviationWetWash,
    alt: 'The exterior of an aircraft with a clean painted skin',
    category: 'aviation',
    caption: 'Painted skin',
    shape: 'square',
  },
  {
    id: 'aviation-dry',
    src: serviceImages.aviationDryWash,
    alt: 'An aircraft photographed from below against an open sky',
    category: 'aviation',
    caption: 'Airframe',
    shape: 'portrait',
  },
  {
    id: 'aviation-cabin',
    src: serviceImages.aviationCabin,
    alt: 'The cabin of a private aircraft, seating and trim in view',
    category: 'aviation',
    caption: 'Cabin interior',
    shape: 'square',
  },
];

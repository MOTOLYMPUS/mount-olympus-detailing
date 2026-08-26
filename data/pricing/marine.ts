// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  MARINE PRICING — PLACEHOLDER. NOT SUPPLIED BY THE BUSINESS.
//
// No marine price list was provided. Every number below is a derived estimate
// based on typical length-banded marine detailing rates — it is NOT this
// business's pricing and WILL be wrong.
//
// While `MARINE_PRICING_IS_PLACEHOLDER` is true, the UI shows an explicit
// "indicative pricing, confirmed after inspection" disclosure on every marine
// estimate, and the notification emails flag the quote as unconfirmed.
//
// To go live: replace the numbers, then set the flag to false. Nothing else
// needs to change.
// ─────────────────────────────────────────────────────────────────────────────

import { AddOnDef, MarineSize, Price, ServiceDef } from '@/lib/types';
import { serviceImages } from '../media';

export const MARINE_PRICING_IS_PLACEHOLDER = true;

/** Length bands, smallest to largest. Keeps the tables below readable. */
const band = (
  pwc: number,
  under20: number,
  b20: number,
  b26: number,
  b33: number,
  b41: number,
  b60: number
): Partial<Record<MarineSize, Price>> => ({
  pwc: { price: pwc },
  'boat-under-20': { price: under20 },
  'boat-20-25': { price: b20 },
  'boat-26-32': { price: b26 },
  'boat-33-40': { price: b33 },
  'boat-41-60': { price: b41 },
  'boat-60-plus': { price: b60 },
});

export const marineServices: ServiceDef[] = [
  {
    id: 'marine-wash',
    industry: 'marine',
    name: 'Exterior Wash & Dry',
    shortDescription:
      'Full freshwater wash-down with marine-safe soap, salt and waterline film removal, and a spot-free hand dry of all gelcoat and glass.',
    includes: [
      'Salt and waterline film removal',
      'Hull, deck, and topside wash',
      'Non-skid surface scrub',
      'Glass and canvas rinse',
      'Spot-free hand dry',
    ],
    estimatedHours: 3,
    image: serviceImages.marineWash,
    prices: band(90, 150, 200, 275, 375, 600, 900),
    addOnIds: ['marine-brightwork'],
  },
  {
    id: 'marine-full-detail',
    industry: 'marine',
    name: 'Premium Full Detail',
    shortDescription:
      'The complete package — exterior wash, gelcoat compound and wax, non-skid restoration, and a full interior and cabin clean.',
    includes: [
      'Complete exterior wash',
      'Gelcoat compound and machine wax',
      'Non-skid deck restoration',
      'Vinyl and upholstery clean with UV protectant',
      'Cabin and interior detail',
      'Stainless and chrome polish',
    ],
    estimatedHours: 8,
    image: serviceImages.marineFullDetail,
    prices: band(200, 400, 550, 750, 1000, 1600, 2500),
    addOnIds: ['marine-brightwork'],
  },
  {
    id: 'marine-hull',
    industry: 'marine',
    name: 'Hull Cleaning & Oxidation Removal',
    shortDescription:
      'Multi-stage gelcoat compounding removes chalking, oxidation, and staining from the hull and waterline, restoring colour and depth.',
    includes: [
      'Acid wash of waterline staining',
      'Multi-stage gelcoat compounding',
      'Oxidation and chalking removal',
      'Polish and sealant',
    ],
    estimatedHours: 6,
    image: serviceImages.marineHull,
    prices: band(120, 300, 400, 550, 750, 1200, 1900),
  },
  {
    id: 'marine-ceramic',
    industry: 'marine',
    name: 'Ceramic Coating',
    shortDescription:
      'A marine-grade ceramic layer over prepared gelcoat, resisting salt, UV, and staining while making every future wash-down dramatically easier.',
    estimatedHours: 14,
    image: serviceImages.marineCeramic,
    prices: band(300, 700, 950, 1300, 1750, 2800, 4200),
  },
  {
    id: 'marine-cabin',
    industry: 'marine',
    name: 'Interior & Cabin Detail',
    shortDescription:
      'Deep clean of the cabin, berths, and helm — upholstery extraction, teak and vinyl treatment, and mildew remediation.',
    includes: [
      'Upholstery and headliner extraction',
      'Vinyl clean with UV protectant',
      'Teak and woodwork treatment',
      'Head and galley sanitation',
      'Mildew treatment',
    ],
    estimatedHours: 5,
    image: serviceImages.marineCabin,
    prices: band(75, 200, 275, 400, 550, 900, 1400),
  },
];

export const marineAddOns: AddOnDef[] = [
  {
    id: 'marine-brightwork',
    industry: 'marine',
    name: 'Metal & Brightwork Polishing',
    description:
      'Hand polishing of stainless rails, cleats, props, and brightwork to a mirror finish, sealed against salt corrosion.',
    estimatedHours: 2.5,
    prices: band(60, 150, 200, 275, 375, 600, 900),
  },
];

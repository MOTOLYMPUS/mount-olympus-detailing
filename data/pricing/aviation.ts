// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  AVIATION PRICING — PLACEHOLDER. NOT SUPPLIED BY THE BUSINESS.
//
// No aviation price list was provided. Every number below is a derived estimate
// based on typical aircraft-class detailing rates — it is NOT this business's
// pricing and WILL be wrong.
//
// Aviation work carries requirements the other two industries do not: FBO ramp
// access, approved products (many consumer chemicals are not permitted on
// aircraft skin or acrylic windows), and insurance naming the operator. Confirm
// these before quoting live.
//
// While `AVIATION_PRICING_IS_PLACEHOLDER` is true, the UI shows an explicit
// "indicative pricing, confirmed after inspection" disclosure on every aviation
// estimate. To go live: replace the numbers, then set the flag to false.
// ─────────────────────────────────────────────────────────────────────────────

import { AddOnDef, AviationSize, Price, ServiceDef } from '@/lib/types';
import { serviceImages } from '../media';

export const AVIATION_PRICING_IS_PLACEHOLDER = true;

const cls = (
  singlePiston: number,
  twinPiston: number,
  turboprop: number,
  lightJet: number,
  midsizeJet: number,
  heavyJet: number,
  helicopter: number
): Partial<Record<AviationSize, Price>> => ({
  'single-piston': { price: singlePiston },
  'twin-piston': { price: twinPiston },
  turboprop: { price: turboprop },
  'light-jet': { price: lightJet },
  'midsize-jet': { price: midsizeJet },
  'heavy-jet': { price: heavyJet },
  helicopter: { price: helicopter },
});

export const aviationServices: ServiceDef[] = [
  {
    id: 'aviation-dry-wash',
    industry: 'aviation',
    name: 'Exterior Dry Wash',
    shortDescription:
      'Waterless exterior clean using approved aviation dry-wash products — permitted on ramps where run-off is restricted, and safe on all skin finishes.',
    includes: [
      'Full fuselage, wing, and empennage dry wash',
      'Leading edge cleaning',
      'Windscreen and cabin window clean with acrylic-safe products',
      'Landing gear wipe down',
    ],
    estimatedHours: 4,
    image: serviceImages.aviationDryWash,
    prices: cls(250, 375, 550, 750, 1100, 1600, 450),
    addOnIds: ['aviation-belly'],
  },
  {
    id: 'aviation-wet-wash',
    industry: 'aviation',
    name: 'Full Exterior Wet Wash & Seal',
    shortDescription:
      'Complete wet wash at an approved wash rack, finished with a polymer sealant that protects the paint and reduces surface drag.',
    includes: [
      'Full wet wash, approved aviation soap',
      'Exhaust and soot stain removal',
      'Polymer sealant application',
      'Landing gear and wheel well clean',
      'Static wick and antenna detail',
    ],
    estimatedHours: 7,
    image: serviceImages.aviationWetWash,
    prices: cls(450, 650, 950, 1300, 1900, 2800, 800),
    addOnIds: ['aviation-belly'],
  },
  {
    id: 'aviation-brightwork',
    industry: 'aviation',
    name: 'Brightwork & Metal Polishing',
    shortDescription:
      'Hand and machine polishing of polished aluminium, spinners, and leading edges to a mirror finish.',
    estimatedHours: 8,
    image: serviceImages.aviationPolish,
    prices: cls(350, 550, 800, 1100, 1600, 2400, 650),
  },
  {
    id: 'aviation-paint-correction',
    industry: 'aviation',
    name: 'Paint Correction & Sealant',
    shortDescription:
      'Multi-stage correction of oxidation, chalking, and UV fade across the airframe, sealed for lasting gloss and easier wash cycles.',
    estimatedHours: 20,
    image: serviceImages.aviationPaint,
    prices: cls(900, 1400, 2100, 2900, 4200, 6200, 1700),
  },
  {
    id: 'aviation-ceramic',
    industry: 'aviation',
    name: 'Ceramic Coating',
    shortDescription:
      'Aviation-grade ceramic coating over corrected paint — long-term UV and chemical resistance with a measurable reduction in surface contamination.',
    estimatedHours: 28,
    image: serviceImages.aviationCeramic,
    prices: cls(1400, 2200, 3300, 4500, 6500, 9500, 2600),
  },
  {
    id: 'aviation-cabin',
    industry: 'aviation',
    name: 'Interior & Cabin Detail',
    shortDescription:
      'Full cabin detail — leather conditioning, carpet extraction, veneer and trim care, galley and lavatory sanitation.',
    includes: [
      'Leather seat clean and condition',
      'Carpet extraction',
      'Veneer and trim detailing',
      'Cockpit and avionics surface clean',
      'Galley and lavatory sanitation',
    ],
    estimatedHours: 6,
    image: serviceImages.aviationCabin,
    prices: cls(300, 450, 700, 950, 1400, 2100, 550),
  },
];

export const aviationAddOns: AddOnDef[] = [
  {
    id: 'aviation-belly',
    industry: 'aviation',
    name: 'Belly De-grease',
    description:
      'Removal of accumulated oil, hydraulic fluid, and exhaust soot from the underside — the single dirtiest area on most airframes.',
    estimatedHours: 3,
    prices: cls(150, 250, 375, 500, 750, 1100, 300),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// AUTOMOTIVE PRICING — REAL, supplied by the business owner.
//
// These figures come directly from the owner's price list and are authoritative.
//
// One caveat, flagged deliberately rather than hidden: the supplied list quotes
// a Coupe price only for Premium Full Detail ($175). For every other service the
// Coupe price below is set equal to the Sedan price, and Small Truck is set to
// the 2-Row SUV price where the list did not distinguish them. Those two cells
// are the only interpolated numbers in this file — search DERIVED to find them.
// Confirm or correct them before launch.
// ─────────────────────────────────────────────────────────────────────────────

import { AddOnDef, ServiceDef } from '@/lib/types';
import { serviceImages } from '../media';

export const AUTOMOTIVE_PRICING_IS_PLACEHOLDER = false;

export const automotiveServices: ServiceDef[] = [
  {
    id: 'auto-exterior-wash',
    industry: 'automotive',
    name: 'Premium Exterior Wash',
    shortDescription:
      'A full touchless pre-wash, snow foam, and two-bucket hand wash finished with a hydrophobic spray sealant for a high-gloss, protected surface.',
    includes: [
      'Wheel and tire cleaning',
      'Tire shine',
      'Wheel well cleaning',
      'Touchless pre-wash',
      'Bug removal',
      'Tar removal',
      'Snow foam hand wash',
      'Two-bucket wash method',
      'Light door jamb wipe down',
      'Exterior window cleaning',
      'Spray wax sealant',
      'Hydrophobic protection',
      'High gloss finish',
    ],
    estimatedHours: 3,
    image: serviceImages.autoExteriorWash,
    prices: {
      coupe: { price: 70 }, // DERIVED from Sedan
      sedan: { price: 70 },
      'suv-2row': { price: 80 },
      'suv-3row': { price: 100 },
      'truck-small': { price: 100 },
      truck: { price: 100 },
    },
    addOnIds: ['auto-clay-bar'],
  },
  {
    id: 'auto-interior-detail',
    industry: 'automotive',
    name: 'Premium Interior Detail',
    shortDescription:
      'Deep interior clean covering every crack and crevice, with leather and upholstery treatment and UV protection applied to hard surfaces.',
    includes: [
      'Full vacuum',
      'Cracks and crevices',
      'Interior windows',
      'Hard surface scrubbing',
      'Leather cleaning',
      'Upholstery cleaning',
      'UV protection',
    ],
    estimatedHours: 3,
    image: serviceImages.autoInterior,
    prices: {
      coupe: { price: 100 }, // DERIVED from Sedan
      sedan: { price: 100 },
      'suv-2row': { price: 110 },
      'suv-3row': { price: 130 },
      'truck-small': { price: 130 },
      truck: { price: 130 },
    },
  },
  {
    id: 'auto-full-detail',
    industry: 'automotive',
    name: 'Premium Full Detail',
    shortDescription:
      'The complete treatment — the full exterior wash and decontamination process combined with a full interior detail, inside and out in a single visit.',
    includes: [
      'Exterior — wheel cleaning, tire shine, wheel wells',
      'Exterior — pre-wash, bug and tar removal, snow foam',
      'Exterior — door jamb cleaning, exterior windows, spray wax',
      'Interior — full vacuum, interior windows',
      'Interior — hard surfaces, seat cleaning, UV protection',
    ],
    estimatedHours: 5,
    image: serviceImages.autoFullDetail,
    prices: {
      coupe: { price: 175 },
      sedan: { price: 190 },
      'suv-2row': { price: 200 },
      'truck-small': { price: 200 },
      'suv-3row': { price: 225 },
      truck: { price: 225 },
    },
    addOnIds: ['auto-clay-bar'],
  },
  {
    id: 'auto-maintenance-wash',
    industry: 'automotive',
    name: 'Maintenance Wash',
    shortDescription:
      'A flat-rate upkeep wash for vehicles already on a regular detailing schedule — keeps protection topped up between full details.',
    includes: ['Exterior hand wash', 'Wheels and tires', 'Exterior windows', 'Spray sealant top-up'],
    estimatedHours: 2,
    image: serviceImages.autoMaintenance,
    prices: {
      coupe: { price: 80 },
      sedan: { price: 80 },
      'suv-2row': { price: 80 },
      'suv-3row': { price: 80 },
      'truck-small': { price: 80 },
      truck: { price: 80 },
    },
  },
  {
    id: 'auto-paint-correction',
    industry: 'automotive',
    name: 'Paint Correction',
    shortDescription:
      'Multi-stage machine polishing removes swirl marks, oxidation, and micro-marring, restoring the paint to its original depth and clarity.',
    estimatedHours: 6,
    image: serviceImages.autoPaintCorrection,
    prices: {
      coupe: { price: 550 }, // DERIVED from Sedan
      sedan: { price: 550 },
      'suv-2row': { price: 700 },
      'truck-small': { price: 700 }, // DERIVED from 2-Row SUV
      'suv-3row': { price: 800 },
      truck: { price: 800 },
    },
  },
  {
    id: 'auto-ceramic-coating',
    industry: 'automotive',
    name: '3-Year Ceramic Coating',
    shortDescription:
      'A durable ceramic layer bonded to the clear coat, delivering three years of chemical resistance, hydrophobic beading, and gloss retention.',
    estimatedHours: 8,
    image: serviceImages.autoCeramic,
    prices: {
      coupe: { price: 300 }, // DERIVED from Sedan
      sedan: { price: 300 },
      'suv-2row': { price: 400 },
      'suv-3row': { price: 400 },
      'truck-small': { price: 400 },
      truck: { price: 400 },
    },
  },

  // ── Motorcycle-only services ───────────────────────────────────────────────
  // These carry prices for the `motorcycle` size class only, which is what keeps
  // them off the menu for every other body style automatically.
  {
    id: 'moto-full-detail',
    industry: 'automotive',
    name: 'Premium Full Detail',
    shortDescription:
      'Complete motorcycle detail — frame, wheels, engine, bodywork, and chrome brought to a uniform finish.',
    estimatedHours: 3,
    image: serviceImages.motorcycle,
    prices: { motorcycle: { price: 150 } },
    addOnIds: ['moto-clay-bar'],
  },
  {
    id: 'moto-oem-refresh',
    industry: 'automotive',
    name: 'OEM Refresh Premium Detail',
    shortDescription:
      'A full concours-level restoration detail returning the machine as close to factory delivery condition as the finish allows.',
    estimatedHours: 8,
    image: serviceImages.motorcycleOem,
    prices: { motorcycle: { price: 400 } },
    addOnIds: ['moto-clay-bar'],
  },
  {
    id: 'moto-paint-correction',
    industry: 'automotive',
    name: 'Paint Correction',
    shortDescription:
      'Machine polishing of tank, fairings, and painted panels to remove swirls and restore gloss.',
    estimatedHours: 3,
    image: serviceImages.motorcycle,
    prices: { motorcycle: { price: 150 } },
  },
  {
    id: 'moto-ceramic-coating',
    industry: 'automotive',
    name: 'Ceramic Coating',
    shortDescription:
      'Ceramic protection across painted and metal surfaces for lasting gloss and far easier cleaning.',
    estimatedHours: 4,
    image: serviceImages.motorcycle,
    prices: { motorcycle: { price: 200 } },
  },
];

export const automotiveAddOns: AddOnDef[] = [
  {
    id: 'auto-clay-bar',
    industry: 'automotive',
    name: 'Clay Bar & Decontamination',
    description:
      'Chemical and mechanical decontamination lifts embedded iron, industrial fallout, and overspray that washing alone leaves behind.',
    estimatedHours: 1.5,
    prices: {
      coupe: { price: 50 },
      sedan: { price: 50 },
      'suv-2row': { price: 60 },
      'suv-3row': { price: 70 },
      'truck-small': { price: 70 },
      truck: { price: 70 },
    },
  },
  {
    id: 'moto-clay-bar',
    industry: 'automotive',
    name: 'Clay Bar & Decontamination',
    description:
      'Decontamination of painted and chrome surfaces. Final price depends on contamination level, confirmed at inspection.',
    estimatedHours: 1,
    // The supplied price list quotes this as a $50–$75 range.
    prices: { motorcycle: { price: 50, priceMax: 75 } },
  },
];

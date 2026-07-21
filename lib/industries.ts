// ─────────────────────────────────────────────────────────────────────────────
// Industry configuration.
//
// This is the single source of truth for everything that changes when the user
// switches between Automotive, Marine, and Aviation: hero imagery, headline and
// subheadline, CTA copy, the noun used for the thing being detailed, the
// vehicle categories on offer, and the size classes within each category.
//
// Components read from here — none of them contain industry conditionals.
// ─────────────────────────────────────────────────────────────────────────────

import { heroImages } from '@/data/media';
import { Industry, SizeClass, SizeOption, VehicleType } from './types';

export interface IndustryConfig {
  id: Industry;
  /** Label on the hero selector card. */
  label: string;
  /** One-line pitch on the selector card. */
  tagline: string;
  hero: { src: string; alt: string };
  headline: [string, string];
  subheadline: string;
  eyebrow: string;
  ctaPrimary: string;
  ctaSecondary: string;
  /** Singular noun for the asset — "vehicle", "vessel", "aircraft". */
  noun: string;
  nounPlural: string;
  /** What the make field is called in this industry. */
  makeLabel: string;
  modelLabel: string;
  /** What the size class represents — "Body style", "Length", "Class". */
  sizeLabel: string;
  /** Year vs. model year vs. year of manufacture. */
  yearLabel: string;
  sectionHeading: string;
  vehicleTypes: VehicleType[];
  sizes: SizeOption[];
  icon: IndustryIcon;
}

export type IndustryIcon = 'car' | 'boat' | 'plane';

export const industries: Record<Industry, IndustryConfig> = {
  // ── Automotive ─────────────────────────────────────────────────────────────
  automotive: {
    id: 'automotive',
    label: 'Automotive',
    tagline: 'Cars, trucks, SUVs & motorcycles',
    hero: heroImages.automotive,
    headline: ['Perfection,', 'Preserved.'],
    subheadline:
      'Paint correction, ceramic coating, and full detailing for vehicles that deserve nothing less.',
    eyebrow: 'Paint Correction · Ceramic · Full Detail',
    ctaPrimary: 'Get My Estimate',
    ctaSecondary: 'View Services',
    noun: 'vehicle',
    nounPlural: 'vehicles',
    makeLabel: 'Make',
    modelLabel: 'Model',
    sizeLabel: 'Body style',
    yearLabel: 'Year',
    sectionHeading: 'Every finish, done to concours standard.',
    icon: 'car',
    vehicleTypes: [
      { id: 'car', label: 'Car', catalog: 'automotive', sizes: ['coupe', 'sedan'] },
      { id: 'suv', label: 'SUV', catalog: 'automotive', sizes: ['suv-2row', 'suv-3row'] },
      { id: 'truck', label: 'Truck', catalog: 'automotive', sizes: ['truck-small', 'truck'] },
      { id: 'motorcycle', label: 'Motorcycle', catalog: 'motorcycle', sizes: ['motorcycle'] },
    ],
    sizes: [
      { id: 'coupe', label: 'Coupe', hint: 'Two doors' },
      { id: 'sedan', label: 'Sedan', hint: 'Four doors' },
      { id: 'suv-2row', label: '2-Row SUV', hint: 'Up to 5 seats' },
      { id: 'suv-3row', label: '3-Row SUV', hint: '6+ seats' },
      { id: 'truck-small', label: 'Small Truck', hint: 'Mid-size pickup' },
      { id: 'truck', label: 'Truck', hint: 'Full-size pickup' },
      { id: 'motorcycle', label: 'Motorcycle', hint: 'All styles' },
    ],
  },

  // ── Marine ─────────────────────────────────────────────────────────────────
  marine: {
    id: 'marine',
    label: 'Marine',
    tagline: 'Boats, PWC, yachts & pontoons',
    hero: heroImages.marine,
    headline: ['Salt Off.', 'Shine On.'],
    subheadline:
      'Gelcoat restoration, ceramic coatings, and full vessel detailing that stand up to sun, salt, and season after season.',
    eyebrow: 'Gelcoat · Ceramic · Full Vessel Detail',
    ctaPrimary: 'Get My Estimate',
    ctaSecondary: 'View Services',
    noun: 'vessel',
    nounPlural: 'vessels',
    makeLabel: 'Builder',
    modelLabel: 'Model',
    sizeLabel: 'Length',
    yearLabel: 'Model year',
    sectionHeading: 'Finished to the standard the water never respects.',
    icon: 'boat',
    vehicleTypes: [
      {
        id: 'boat',
        label: 'Boat',
        catalog: 'marine',
        sizes: ['boat-under-20', 'boat-20-25', 'boat-26-32', 'boat-33-40'],
      },
      { id: 'pwc', label: 'Personal Watercraft', catalog: 'marine', sizes: ['pwc'] },
      {
        id: 'yacht',
        label: 'Yacht',
        catalog: 'marine',
        sizes: ['boat-41-60', 'boat-60-plus'],
      },
      {
        id: 'fishing-boat',
        label: 'Fishing Boat',
        catalog: 'marine',
        sizes: ['boat-under-20', 'boat-20-25', 'boat-26-32', 'boat-33-40'],
      },
      {
        id: 'pontoon',
        label: 'Pontoon Boat',
        catalog: 'marine',
        sizes: ['boat-under-20', 'boat-20-25', 'boat-26-32'],
      },
    ],
    sizes: [
      { id: 'pwc', label: 'PWC', hint: 'Jet ski / waverunner' },
      { id: 'boat-under-20', label: 'Under 20 ft' },
      { id: 'boat-20-25', label: '20 – 25 ft' },
      { id: 'boat-26-32', label: '26 – 32 ft' },
      { id: 'boat-33-40', label: '33 – 40 ft' },
      { id: 'boat-41-60', label: '41 – 60 ft' },
      { id: 'boat-60-plus', label: '60 ft +' },
    ],
  },

  // ── Aviation ───────────────────────────────────────────────────────────────
  aviation: {
    id: 'aviation',
    label: 'Aviation',
    tagline: 'Piston, turboprop, jets & rotorcraft',
    hero: heroImages.aviation,
    headline: ['Hangar Ready.', 'Ramp Proud.'],
    subheadline:
      'Approved dry wash, brightwork polishing, and cabin detailing for aircraft held to a standard no one gets to relax.',
    eyebrow: 'Dry Wash · Brightwork · Cabin Detail',
    ctaPrimary: 'Get My Estimate',
    ctaSecondary: 'View Services',
    noun: 'aircraft',
    nounPlural: 'aircraft',
    makeLabel: 'Manufacturer',
    modelLabel: 'Type',
    sizeLabel: 'Class',
    yearLabel: 'Year',
    sectionHeading: 'Presentation that matches the logbook.',
    icon: 'plane',
    vehicleTypes: [
      {
        id: 'single-engine',
        label: 'Single Engine Aircraft',
        catalog: 'aviation',
        sizes: ['single-piston'],
      },
      {
        id: 'twin-engine',
        label: 'Twin Engine Aircraft',
        catalog: 'aviation',
        sizes: ['twin-piston'],
      },
      { id: 'turboprop', label: 'Turboprop', catalog: 'aviation', sizes: ['turboprop'] },
      {
        id: 'private-jet',
        label: 'Private Jet',
        catalog: 'aviation',
        sizes: ['light-jet', 'midsize-jet', 'heavy-jet'],
      },
      { id: 'helicopter', label: 'Helicopter', catalog: 'aviation', sizes: ['helicopter'] },
    ],
    sizes: [
      { id: 'single-piston', label: 'Single Engine Piston' },
      { id: 'twin-piston', label: 'Twin Engine Piston' },
      { id: 'turboprop', label: 'Turboprop' },
      { id: 'light-jet', label: 'Light Jet' },
      { id: 'midsize-jet', label: 'Midsize Jet' },
      { id: 'heavy-jet', label: 'Heavy Jet' },
      { id: 'helicopter', label: 'Helicopter' },
    ],
  },
};

export const industryList = Object.values(industries);

export function getIndustry(id: Industry): IndustryConfig {
  return industries[id];
}

export function getVehicleType(industry: Industry, typeId: string): VehicleType | undefined {
  return industries[industry].vehicleTypes.find((t) => t.id === typeId);
}

/** Human label for a size class, resolved across every industry. */
export function sizeLabel(size: SizeClass): string {
  for (const cfg of industryList) {
    const match = cfg.sizes.find((s) => s.id === size);
    if (match) return match.label;
  }
  return size;
}

/** Which industry a given size class belongs to — used for server-side validation. */
export function industryForSize(size: SizeClass): Industry | undefined {
  return industryList.find((cfg) => cfg.sizes.some((s) => s.id === size))?.id;
}

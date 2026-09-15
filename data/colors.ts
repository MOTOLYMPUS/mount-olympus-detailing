// ─────────────────────────────────────────────────────────────────────────────
// Exterior colour choices for the garage vehicle form.
//
// These are the standard factory colour FAMILIES per industry, not a per-make /
// per-model-year paint-code catalogue. Manufacturer paint availability by model
// year is not published as open data; the commercial paint-code databases are
// paid and licensed. A colour family is what the detailer needs anyway — it
// decides the correction and coating approach — and the free-text "Other"
// option (plus the notes field) covers the exact factory name when it matters.
// ─────────────────────────────────────────────────────────────────────────────

import { Industry } from '@/lib/types';

/** The value stored for the free-text option. Never persisted as-is. */
export const OTHER_COLOR = 'Other';

const AUTOMOTIVE: string[] = [
  'White',
  'Pearl White',
  'Black',
  'Metallic Black',
  'Silver',
  'Gray',
  'Charcoal',
  'Red',
  'Burgundy / Dark Red',
  'Blue',
  'Navy / Dark Blue',
  'Light Blue',
  'Green',
  'Dark Green',
  'Brown',
  'Beige / Tan',
  'Gold / Champagne',
  'Bronze / Copper',
  'Orange',
  'Yellow',
  'Purple',
  'Matte finish',
  'Vinyl wrap',
  'Two-tone',
];

const MARINE: string[] = [
  'White gelcoat',
  'Off-white / Cream',
  'Black',
  'Navy',
  'Blue',
  'Light Blue',
  'Teal',
  'Gray',
  'Red',
  'Green',
  'Yellow',
  'Two-tone hull',
];

const AVIATION: string[] = [
  'White',
  'White with stripes',
  'Silver / Bare metal',
  'Gray',
  'Blue',
  'Red',
  'Black',
  'Green',
  'Yellow',
  'Multi-colour livery',
];

const BY_INDUSTRY: Record<Industry, string[]> = {
  automotive: AUTOMOTIVE,
  marine: MARINE,
  aviation: AVIATION,
};

/** Colour options for the industry, always ending with the free-text "Other". */
export function colorsForIndustry(industry: Industry): string[] {
  return [...BY_INDUSTRY[industry], OTHER_COLOR];
}

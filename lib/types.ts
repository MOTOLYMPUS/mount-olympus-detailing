// ─────────────────────────────────────────────────────────────────────────────
// Core domain model.
//
// The application serves three industries from one codebase. Almost everything
// user-facing is keyed off `Industry`, so adding a fourth would mean adding an
// entry to lib/industries.ts and a pricing table in data/pricing/ — no component
// changes.
// ─────────────────────────────────────────────────────────────────────────────

export type Industry = 'automotive' | 'marine' | 'aviation';

export const INDUSTRIES: Industry[] = ['automotive', 'marine', 'aviation'];

export function isIndustry(v: unknown): v is Industry {
  return typeof v === 'string' && (INDUSTRIES as string[]).includes(v);
}

// ── Size classes ─────────────────────────────────────────────────────────────
// A "size class" is what pricing is actually keyed on. Each industry has its
// own vocabulary; a boat is priced by length, an aircraft by class, a car by
// body style.

export type AutomotiveSize =
  | 'coupe'
  | 'sedan'
  | 'suv-2row'
  | 'suv-3row'
  | 'truck-small'
  | 'truck'
  | 'motorcycle';

export type MarineSize =
  | 'pwc'
  | 'boat-under-20'
  | 'boat-20-25'
  | 'boat-26-32'
  | 'boat-33-40'
  | 'boat-41-60'
  | 'boat-60-plus';

export type AviationSize =
  | 'single-piston'
  | 'twin-piston'
  | 'turboprop'
  | 'light-jet'
  | 'midsize-jet'
  | 'heavy-jet'
  | 'helicopter';

export type SizeClass = AutomotiveSize | MarineSize | AviationSize;

export interface SizeOption {
  id: SizeClass;
  label: string;
  /** Shown under the label to disambiguate — e.g. "3rd row seating". */
  hint?: string;
}

export type CatalogKey = 'automotive' | 'motorcycle' | 'marine' | 'aviation';

/**
 * A category of thing the customer owns — "SUV", "Pontoon Boat", "Turboprop".
 * Selecting one narrows both the size classes on offer and which make/model
 * catalog is searched.
 */
export interface VehicleType {
  id: string;
  label: string;
  sizes: SizeClass[];
  catalog: CatalogKey;
}

// ── Pricing ──────────────────────────────────────────────────────────────────

/**
 * Some line items are quoted as a range (the motorcycle clay bar add-on is
 * $50–$75 depending on condition). `priceMax` is omitted when the price is fixed.
 */
export interface Price {
  price: number;
  priceMax?: number;
}

export interface ServiceDef {
  id: string;
  industry: Industry;
  name: string;
  shortDescription: string;
  /** Bullet list shown on the service card and in the estimate breakdown. */
  includes?: string[];
  estimatedHours: number;
  image: string;
  /**
   * Price per size class. A service is offered for a given size class if and
   * only if there is an entry here — this is how motorcycle-only services stay
   * off the menu for a truck, with no extra conditional logic.
   */
  prices: Partial<Record<SizeClass, Price>>;
  /** Add-ons the customer may attach to this service. */
  addOnIds?: string[];
}

export interface AddOnDef {
  id: string;
  industry: Industry;
  name: string;
  description: string;
  estimatedHours: number;
  prices: Partial<Record<SizeClass, Price>>;
}

export interface EstimateLine {
  id: string;
  label: string;
  kind: 'service' | 'addon';
  price: number;
  priceMax?: number;
}

export interface EstimateResult {
  lines: EstimateLine[];
  /** Sum of selected services only. */
  basePrice: number;
  basePriceMax: number;
  /** Sum of selected add-ons only. */
  addOnPrice: number;
  addOnPriceMax: number;
  total: number;
  /** Equals `total` unless a ranged line item is selected. */
  totalMax: number;
  estimatedHours: number;
  /**
   * True when any selected line comes from a price table the business has not
   * yet calibrated. The UI must disclose this — see data/pricing/README.md.
   */
  isPlaceholderPricing: boolean;
}

// ── Vehicle catalog ──────────────────────────────────────────────────────────

export interface Make {
  name: string;
  models: string[];
}

// ── Scheduling ───────────────────────────────────────────────────────────────

export interface TimeSlot {
  time: string;
  period: 'morning' | 'afternoon' | 'evening';
  available: boolean;
}

// ── Estimate request (what gets persisted + notified) ────────────────────────

export interface EstimateRequestInput {
  name: string;
  email: string;
  phone: string;
  industry: Industry;
  vehicleType: string;
  make: string;
  model: string;
  year: string;
  sizeClass: SizeClass;
  serviceIds: string[];
  addOnIds: string[];
  preferredDate: string | null;
  notes: string;
  /** TCPA consent for the SMS confirmation. Required before any SMS is sent. */
  smsConsent: boolean;
}

export interface EstimateRequestRecord extends EstimateRequestInput {
  id: string;
  reference: string;
  /** Recomputed server-side — never trusted from the client. */
  quotedTotal: number;
  quotedTotalMax: number;
  estimatedHours: number;
  isPlaceholderPricing: boolean;
  createdAt: string;
  status: 'new' | 'contacted' | 'scheduled' | 'closed';
}

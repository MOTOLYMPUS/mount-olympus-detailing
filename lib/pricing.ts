// ─────────────────────────────────────────────────────────────────────────────
// Pricing engine.
//
// Prices are looked up from fixed (service × size class) tables in data/pricing/
// — there is no multiplier maths and no invented numbers. If a service has no
// entry for the selected size class, it is not offered for that size, full stop.
//
// This module is imported by BOTH the client (live estimate display) and the
// API route (authoritative recomputation). The server never trusts a
// client-supplied total; it recalculates from the same tables.
// ─────────────────────────────────────────────────────────────────────────────

import { getAddOn, getService, pricingIsPlaceholder, servicesForIndustry } from '@/data/pricing';
import { AddOnDef, EstimateLine, EstimateResult, Industry, Price, ServiceDef, SizeClass } from './types';

// ── Admin price overrides ────────────────────────────────────────────────────
//
// The code tables in data/pricing/ are the DEFAULTS. The owner can override any
// individual (service × size) price from the admin; those overrides live in the
// database and are layered on top here.
//
// An override can only change a price cell that ALREADY EXISTS — it cannot
// invent a price for a size a service does not offer. That keeps "which
// services appear for which size" a structural, code-level decision, while the
// numbers themselves become editable. Overrides with no matching base cell are
// ignored rather than trusted.
//
// This map is passed in by the caller: the server loads it from the database
// (authoritative), and the client fetches it once (so the live preview matches
// what the server will actually store). Passing nothing preserves the original
// code-only behaviour exactly.
export type PriceOverrides = Record<string, Partial<Record<SizeClass, Price>>>;

/** Effective price for one item at one size: an override if present, else the code default. */
export function priceFor(
  item: { id: string; prices: Partial<Record<SizeClass, Price>> },
  size: SizeClass,
  overrides?: PriceOverrides
): Price | undefined {
  const base = item.prices[size];
  // No base cell → the item is not offered at this size; an override cannot
  // create one. This is the invariant that keeps overrides purely numeric.
  if (base === undefined) return undefined;
  return overrides?.[item.id]?.[size] ?? base;
}

/** Services offered for a given industry AND size class. */
export function availableServices(industry: Industry, size: SizeClass | null): ServiceDef[] {
  const all = servicesForIndustry(industry);
  if (!size) return all;
  return all.filter((s) => s.prices[size] !== undefined);
}

/** Add-ons attachable to the currently selected services, for this size class. */
export function availableAddOns(serviceIds: string[], size: SizeClass | null): AddOnDef[] {
  const ids = new Set<string>();
  serviceIds.forEach((sid) => getService(sid)?.addOnIds?.forEach((a) => ids.add(a)));

  const out: AddOnDef[] = [];
  ids.forEach((id) => {
    const addOn = getAddOn(id);
    if (!addOn) return;
    if (size && addOn.prices[size] === undefined) return;
    out.push(addOn);
  });
  return out;
}

export interface EstimateInput {
  industry: Industry;
  size: SizeClass | null;
  serviceIds: string[];
  addOnIds: string[];
  /** Admin price overrides. Omit for the raw code defaults. */
  overrides?: PriceOverrides;
}

/**
 * Build a full estimate. Returns null when there is nothing to price yet.
 *
 * Unknown ids, and ids that carry no price for the selected size class, are
 * skipped rather than throwing — a stale selection left over from an industry
 * switch must never produce a wrong number or a crash.
 */
export function calculateEstimate({
  industry,
  size,
  serviceIds,
  addOnIds,
  overrides,
}: EstimateInput): EstimateResult | null {
  if (!size || serviceIds.length === 0) return null;

  const lines: EstimateLine[] = [];
  let basePrice = 0;
  let basePriceMax = 0;
  let addOnPrice = 0;
  let addOnPriceMax = 0;
  let estimatedHours = 0;

  for (const id of serviceIds) {
    const svc = getService(id);
    if (!svc || svc.industry !== industry) continue;
    const price = priceFor(svc, size, overrides);
    if (!price) continue;

    lines.push({
      id: svc.id,
      label: svc.name,
      kind: 'service',
      price: price.price,
      priceMax: price.priceMax,
    });
    basePrice += price.price;
    basePriceMax += price.priceMax ?? price.price;
    estimatedHours += svc.estimatedHours;
  }

  // An add-on only counts if one of the selected services actually offers it.
  const attachable = new Set(availableAddOns(serviceIds, size).map((a) => a.id));

  for (const id of addOnIds) {
    if (!attachable.has(id)) continue;
    const addOn = getAddOn(id);
    if (!addOn || addOn.industry !== industry) continue;
    const price = priceFor(addOn, size, overrides);
    if (!price) continue;

    lines.push({
      id: addOn.id,
      label: addOn.name,
      kind: 'addon',
      price: price.price,
      priceMax: price.priceMax,
    });
    addOnPrice += price.price;
    addOnPriceMax += price.priceMax ?? price.price;
    estimatedHours += addOn.estimatedHours;
  }

  if (lines.length === 0) return null;

  return {
    lines,
    basePrice,
    basePriceMax,
    addOnPrice,
    addOnPriceMax,
    total: basePrice + addOnPrice,
    totalMax: basePriceMax + addOnPriceMax,
    estimatedHours: Math.round(estimatedHours * 2) / 2,
    isPlaceholderPricing: pricingIsPlaceholder[industry],
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Cents-accurate money, always to two decimals — for invoices, expenses, and
 * anything financial where $142.50 must not round to $143. `formatCurrency`
 * above deliberately drops cents for menu prices; this never does.
 */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "$70" for a fixed price, "$50 – $75" when the quote is a range. */
export function formatPrice(price: number, priceMax?: number): string {
  if (priceMax !== undefined && priceMax !== price) {
    return `${formatCurrency(price)} – ${formatCurrency(priceMax)}`;
  }
  return formatCurrency(price);
}

/** Lowest price a service is offered at, across all size classes (overrides applied). */
export function startingPrice(service: ServiceDef, overrides?: PriceOverrides): number {
  const sizes = Object.keys(service.prices) as SizeClass[];
  const values = sizes
    .map((size) => priceFor(service, size, overrides)?.price)
    .filter((v): v is number => v !== undefined);
  return values.length ? Math.min(...values) : 0;
}

export function formatHours(hours: number): string {
  if (hours >= 8) {
    const days = Math.ceil(hours / 8);
    return `${hours} hrs · approx. ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return `${hours} hrs`;
}

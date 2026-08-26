import { AddOnDef, Industry, ServiceDef } from '@/lib/types';
import {
  AUTOMOTIVE_PRICING_IS_PLACEHOLDER,
  automotiveAddOns,
  automotiveServices,
} from './automotive';
import { MARINE_PRICING_IS_PLACEHOLDER, marineAddOns, marineServices } from './marine';
import { AVIATION_PRICING_IS_PLACEHOLDER, aviationAddOns, aviationServices } from './aviation';

export const allServices: ServiceDef[] = [
  ...automotiveServices,
  ...marineServices,
  ...aviationServices,
];

export const allAddOns: AddOnDef[] = [...automotiveAddOns, ...marineAddOns, ...aviationAddOns];

/**
 * Whether an industry's price tables are still uncalibrated placeholders.
 * Consumed by the UI to render a disclosure, and by the notification templates
 * so the business never receives an unmarked speculative quote.
 */
export const pricingIsPlaceholder: Record<Industry, boolean> = {
  automotive: AUTOMOTIVE_PRICING_IS_PLACEHOLDER,
  marine: MARINE_PRICING_IS_PLACEHOLDER,
  aviation: AVIATION_PRICING_IS_PLACEHOLDER,
};

const serviceById = new Map(allServices.map((s) => [s.id, s]));
const addOnById = new Map(allAddOns.map((a) => [a.id, a]));

export function getService(id: string): ServiceDef | undefined {
  return serviceById.get(id);
}

export function getAddOn(id: string): AddOnDef | undefined {
  return addOnById.get(id);
}

export function servicesForIndustry(industry: Industry): ServiceDef[] {
  return allServices.filter((s) => s.industry === industry);
}

import { EstimateResult, ServiceId, VehicleSize } from './types';

// Base price/hours per service, tuned for a mid-size coupe. Multiplied by
// the vehicle-size factor below. All figures are placeholders for the
// business owner to calibrate against real shop rates.
export const SERVICE_BASE: Record<ServiceId, { price: number; hours: number }> = {
  'paint-correction': { price: 650, hours: 6 },
  'ceramic-coating': { price: 900, hours: 8 },
  ppf: { price: 2400, hours: 14 },
  interior: { price: 320, hours: 3 },
  exterior: { price: 220, hours: 2 },
  'engine-bay': { price: 140, hours: 1.5 },
  'window-coating': { price: 180, hours: 1.5 },
  'headlight-restoration': { price: 120, hours: 1 },
};

export const SIZE_MULTIPLIER: Record<VehicleSize, number> = {
  sedan: 0.9,
  coupe: 1,
  suv: 1.2,
  truck: 1.3,
  exotic: 1.5,
};

export const SIZE_LABEL: Record<VehicleSize, string> = {
  sedan: 'Sedan',
  coupe: 'Coupe',
  suv: 'SUV',
  truck: 'Truck',
  exotic: 'Exotic',
};

const DEPOSIT_RATE = 0.25;
const BUSINESS_HOURS_PER_DAY = 7;

export function calculateEstimate(
  size: VehicleSize,
  services: ServiceId[]
): EstimateResult | null {
  if (services.length === 0) return null;

  const multiplier = SIZE_MULTIPLIER[size];

  let price = 0;
  let hours = 0;
  services.forEach((id) => {
    const base = SERVICE_BASE[id];
    price += base.price * multiplier;
    hours += base.hours * multiplier;
  });

  // Bundling more than one service earns a small efficiency discount,
  // mirroring how a real shop would price combined work.
  if (services.length >= 2) price *= 0.95;
  if (services.length >= 4) price *= 0.97;

  const roundedPrice = Math.round(price / 5) * 5;
  const roundedHours = Math.round(hours * 2) / 2;
  const deposit = Math.round((roundedPrice * DEPOSIT_RATE) / 5) * 5;

  const daysNeeded = Math.max(1, Math.ceil(roundedHours / BUSINESS_HOURS_PER_DAY));
  const completion = new Date();
  completion.setDate(completion.getDate() + daysNeeded + 1); // +1 buffer for queue

  return {
    estimatedHours: roundedHours,
    estimatedPrice: roundedPrice,
    depositRequired: deposit,
    estimatedCompletion: completion.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

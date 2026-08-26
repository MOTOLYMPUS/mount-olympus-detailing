// ─────────────────────────────────────────────────────────────────────────────
// Maintenance reminders and service recommendations.
//
// Rules, not machine learning. Detailing intervals are well understood and a
// customer is far better served by "your ceramic coating is due its annual
// inspection" than by an opaque score. Every rule below states its reasoning,
// so an owner who disagrees can change the number and know what they changed.
//
// Everything is derived from what the customer already has: their vehicles and
// their completed appointments. Nothing here needs new data collection.
// ─────────────────────────────────────────────────────────────────────────────

import { Appointment, Vehicle, vehicleLabel } from './models';
import { getService } from '@/data/pricing';
import { availableServices } from './pricing';
import { ServiceDef } from './types';

export interface Reminder {
  id: string;
  /** Higher sorts first. */
  priority: number;
  title: string;
  detail: string;
  vehicleId?: string;
  /** Deep link that pre-selects the right service in the booking flow. */
  href: string;
  kind: 'ceramic' | 'wash' | 'interior' | 'correction' | 'first-visit' | 'overdue';
}

const DAY = 24 * 60 * 60 * 1000;

/** How often each kind of work should recur, in days. */
const INTERVALS = {
  /** A maintenance wash keeps a coating performing; fortnightly is the norm. */
  wash: 21,
  /** Coatings want an annual inspection and decontamination. */
  ceramicInspection: 365,
  /** Interiors that see daily use want a deep clean twice a year. */
  interior: 182,
  /** Paint correction is not routine — flag it only after a long gap. */
  correction: 730,
} as const;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

/** Does a service id look like the given category? */
function matches(serviceId: string, pattern: RegExp): boolean {
  const service = getService(serviceId);
  return pattern.test(serviceId) || (!!service && pattern.test(service.name.toLowerCase()));
}

const CERAMIC = /ceramic|coating|graphene/i;
const WASH = /wash|maintenance|express/i;
const INTERIOR = /interior|shampoo|leather|upholstery/i;
const CORRECTION = /correction|polish|paint|compound|gelcoat/i;

export function buildReminders(vehicles: Vehicle[], history: Appointment[]): Reminder[] {
  const reminders: Reminder[] = [];
  const completed = history.filter((a) => a.status === 'completed');

  // ── No vehicles yet ───────────────────────────────────────────────────────
  if (!vehicles.length) {
    return [
      {
        id: 'add-vehicle',
        priority: 100,
        kind: 'first-visit',
        title: 'Add your first vehicle',
        detail:
          'Saving a vehicle means we already know its size and finish, so booking takes seconds and your quote is accurate.',
        href: '/app/garage/new',
      },
    ];
  }

  for (const vehicle of vehicles) {
    const forVehicle = completed
      .filter((a) => a.vehicleId === vehicle.id)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

    const label = vehicleLabel(vehicle);

    // ── Never serviced ──────────────────────────────────────────────────────
    if (!forVehicle.length) {
      reminders.push({
        id: `first-${vehicle.id}`,
        priority: 60,
        kind: 'first-visit',
        vehicleId: vehicle.id,
        title: `Book your first detail for the ${label}`,
        detail: 'A full detail establishes a baseline — everything after it is maintenance.',
        href: `/app/book?vehicle=${vehicle.id}`,
      });
      continue;
    }

    const lastAny = forVehicle[0];
    const lastOf = (pattern: RegExp) =>
      forVehicle.find((a) => [...a.serviceIds, ...a.addOnIds].some((id) => matches(id, pattern)));

    // ── Ceramic coating maintenance ─────────────────────────────────────────
    const lastCeramic = lastOf(CERAMIC);
    if (lastCeramic) {
      const age = daysSince(lastCeramic.startsAt);
      if (age >= INTERVALS.ceramicInspection) {
        reminders.push({
          id: `ceramic-${vehicle.id}`,
          priority: 95,
          kind: 'ceramic',
          vehicleId: vehicle.id,
          title: `Coating inspection due on the ${label}`,
          detail: `The coating was applied ${Math.floor(age / 30)} months ago. An annual decontamination and inspection is what keeps most warranties valid and the hydrophobics working.`,
          href: `/app/book?vehicle=${vehicle.id}`,
        });
      } else if (age >= INTERVALS.ceramicInspection - 45) {
        reminders.push({
          id: `ceramic-soon-${vehicle.id}`,
          priority: 70,
          kind: 'ceramic',
          vehicleId: vehicle.id,
          title: `Coating inspection coming up on the ${label}`,
          detail: `Due in about ${INTERVALS.ceramicInspection - age} days. Worth booking early — these slots go first.`,
          href: `/app/book?vehicle=${vehicle.id}`,
        });
      }

      // A coated vehicle needs the right wash, not any wash.
      const lastWash = lastOf(WASH) ?? lastCeramic;
      if (daysSince(lastWash.startsAt) >= INTERVALS.wash) {
        reminders.push({
          id: `wash-${vehicle.id}`,
          priority: 55,
          kind: 'wash',
          vehicleId: vehicle.id,
          title: `Maintenance wash due on the ${label}`,
          detail: `It has been ${daysSince(lastWash.startsAt)} days. A coated finish wants a pH-neutral wash roughly every ${INTERVALS.wash} days to stay slick.`,
          href: `/app/book?vehicle=${vehicle.id}`,
        });
      }
    }

    // ── Interior ────────────────────────────────────────────────────────────
    const lastInterior = lastOf(INTERIOR);
    if (lastInterior && daysSince(lastInterior.startsAt) >= INTERVALS.interior) {
      reminders.push({
        id: `interior-${vehicle.id}`,
        priority: 50,
        kind: 'interior',
        vehicleId: vehicle.id,
        title: `Interior deep clean due on the ${label}`,
        detail: `Last done ${Math.floor(daysSince(lastInterior.startsAt) / 30)} months ago. Twice a year keeps fabric and leather from setting in.`,
        href: `/app/book?vehicle=${vehicle.id}`,
      });
    }

    // ── Long gap ────────────────────────────────────────────────────────────
    const gap = daysSince(lastAny.startsAt);
    if (gap >= 240 && !reminders.some((r) => r.vehicleId === vehicle.id)) {
      reminders.push({
        id: `overdue-${vehicle.id}`,
        priority: 45,
        kind: 'overdue',
        vehicleId: vehicle.id,
        title: `The ${label} has not been in for a while`,
        detail: `Last visit was ${Math.floor(gap / 30)} months ago. A decontamination now is cheaper than correction later.`,
        href: `/app/book?vehicle=${vehicle.id}`,
      });
    }

    // ── Correction ──────────────────────────────────────────────────────────
    const lastCorrection = lastOf(CORRECTION);
    if (!lastCorrection && forVehicle.length >= 2) {
      reminders.push({
        id: `correction-${vehicle.id}`,
        priority: 30,
        kind: 'correction',
        vehicleId: vehicle.id,
        title: `Consider paint correction for the ${label}`,
        detail:
          'Washing removes dirt but not the fine swirls that dull a finish under direct light. Correction is what actually restores gloss.',
        href: `/app/book?vehicle=${vehicle.id}`,
      });
    }
  }

  return reminders.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

/**
 * Services worth suggesting for a vehicle: what is available for its size class
 * that the customer has not already bought recently. Ordered by price ascending
 * so the cheapest, easiest yes appears first.
 */
export function recommendServices(
  vehicle: Vehicle,
  history: Appointment[],
  limit = 3
): ServiceDef[] {
  const bought = new Set(
    history
      .filter((a) => a.vehicleId === vehicle.id && a.status === 'completed')
      .filter((a) => daysSince(a.startsAt) < 180)
      .flatMap((a) => a.serviceIds)
  );

  return availableServices(vehicle.industry, vehicle.sizeClass)
    .filter((s) => !bought.has(s.id))
    .sort((a, b) => (a.prices[vehicle.sizeClass]?.price ?? 0) - (b.prices[vehicle.sizeClass]?.price ?? 0))
    .slice(0, limit);
}

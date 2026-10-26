// ─────────────────────────────────────────────────────────────────────────────
// Mileage — the rules on top of lib/repo/mileage.ts.
//
//  • logJobTrip: when a MOBILE appointment is completed, log the drive.
//    Home is the principal place of business, so base → customer → base is
//    deductible. Several mobile jobs on the same local day in the same vehicle
//    are ONE loop (base → job1 → job2 → base), not separate round trips —
//    that is how the day was actually driven.
//  • recalculateTrip: fetch the driving distance for a trip's addresses. Runs
//    after the completion response has gone, so a slow map service never holds
//    up "Complete job" on a phone.
//  • vehicleYearSummaries: per-vehicle miles, business-use %, and the
//    standard-mileage deduction for a tax year.
//
// An organiser for the owner's tax preparer, not tax advice.
// ─────────────────────────────────────────────────────────────────────────────

import { Appointment, BusinessVehicle, Expense, Trip, TripStop, User } from './models';
import { routeMiles } from './geo';
import { getService } from '@/data/pricing';
import { getUser } from './repo/users';
import { getAppointment } from './repo/appointments';
import { getSchedulingConfig, getTaxProfile, mileageRateMills } from './repo/settings';
import {
  createTrip,
  defaultVehicleFor,
  deleteTrip,
  getTrip,
  jobLoopFor,
  linkAppointment,
  listBusinessVehicles,
  milesByVehicle,
  setTripMiles,
  tripForAppointment,
  tripForExpense,
  updateTrip,
} from './repo/mileage';
import { toLocalParts } from './timezone';

export const CALCULATING = 'Calculating distance…';

/** "Full Detail; Ceramic Coating" for an appointment's services. */
function servicesLabel(a: Appointment): string {
  return a.serviceIds.map((id) => getService(id)?.name ?? id).join(', ');
}

function stopFor(a: Appointment): TripStop {
  const customer = getUser(a.customerId);
  return {
    label: `${customer?.name ?? 'Customer'} · ${a.reference}`,
    address: a.address,
    appointmentId: a.id,
  };
}

/** "Jobs MOD-ABC-123, MOD-DEF-456: Full Detail; Interior Detail" */
function purposeFor(appointments: Appointment[]): string {
  const refs = appointments.map((a) => a.reference).join(', ');
  const services = Array.from(new Set(appointments.map(servicesLabel).filter(Boolean))).join('; ');
  return `${appointments.length > 1 ? 'Jobs' : 'Job'} ${refs}${services ? `: ${services}` : ''}`;
}

/** Insert a job stop among the existing ones in appointment start order; typed stops keep their place. */
function insertJobStop(stops: TripStop[], stop: TripStop, startsAt: string): TripStop[] {
  const next = [...stops];
  const later = next.findIndex((s) => {
    if (!s.appointmentId) return false;
    const other = getAppointment(s.appointmentId);
    return !!other && other.startsAt > startsAt;
  });
  if (later >= 0) {
    next.splice(later, 0, stop);
  } else {
    const lastJob = next.map((s) => !!s.appointmentId).lastIndexOf(true);
    next.splice(lastJob + 1, 0, stop);
  }
  return next;
}

/**
 * Log (or extend) the trip for a completed appointment. Idempotent: an
 * appointment already on a trip is left alone. Never throws — mileage is
 * bookkeeping and must not fail a job completion.
 */
export function logJobTrip(appointment: Appointment, actor: Pick<User, 'id'>): Trip | null {
  try {
    if (appointment.locationType !== 'mobile' || !appointment.address.trim()) return null;
    if (tripForAppointment(appointment.id)) return null;

    const { timezone } = getSchedulingConfig();
    const date = toLocalParts(new Date(appointment.startsAt), timezone).dateIso;
    const vehicle = defaultVehicleFor(date);
    const base = getTaxProfile().baseAddress;
    const stop = stopFor(appointment);

    const loop = jobLoopFor(date, vehicle?.id ?? null);
    let trip: Trip;
    if (loop) {
      linkAppointment(loop.id, appointment.id);
      const jobs = [...loop.appointmentIds, appointment.id]
        .map((id) => getAppointment(id))
        .filter((a): a is Appointment => !!a)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const routed = loop.source === 'route';
      trip = updateTrip(loop.id, {
        ...loop,
        stops: insertJobStop(loop.stops, stop, appointment.startsAt),
        purpose: purposeFor(jobs),
        // A loop the owner measured by odometer or typed in is theirs: add the
        // stop, keep their miles, and ask them to check.
        needsReview: true,
        reviewReason: routed ? CALCULATING : 'Another job was added to this trip — check the miles.',
      })!;
      if (!routed) return trip;
    } else {
      trip = createTrip(
        {
          tripDate: date,
          businessVehicleId: vehicle?.id ?? null,
          startAddress: base,
          stops: [stop],
          endAddress: base,
          purpose: purposeFor([appointment]),
          milesTenths: null,
          source: 'route',
          odometerStart: null,
          odometerEnd: null,
          odometerStartKey: null,
          odometerEndKey: null,
          needsReview: true,
          reviewReason: base ? CALCULATING : 'Add your business address in Tax profile, then Recalculate.',
          notes: '',
        },
        actor.id,
        [appointment.id]
      );
      if (!base) return trip;
    }

    recalculateTrip(trip.id).catch((e) => console.error('[mileage] recalculation failed', e));
    return trip;
  } catch (e) {
    console.error('[mileage] could not log trip for', appointment.id, e);
    return null;
  }
}

const routeKey = (t: Trip) => JSON.stringify([t.startAddress, ...t.stops.map((s) => s.address), t.endAddress]);

/**
 * Look up the driving distance for a trip's addresses and store it, or store
 * why it could not be found (miles left blank, trip flagged). If the trip's
 * route changed while the lookup was in flight, the stale answer is dropped.
 */
export async function recalculateTrip(id: string): Promise<Trip | null> {
  const before = getTrip(id);
  if (!before) return null;

  // A one-way trip ends at its last stop; drop the repeated point rather than
  // ask the router for a zero-length leg.
  const points = [before.startAddress, ...before.stops.map((s) => s.address), before.endAddress].filter(
    (a, i, all) => i === 0 || a !== all[i - 1]
  );
  const result = await routeMiles(points);

  const now = getTrip(id);
  if (!now || routeKey(now) !== routeKey(before)) return now;

  if (result.ok) {
    const reason = now.businessVehicleId ? '' : 'No vehicle was in service that day — pick one.';
    setTripMiles(id, result.milesTenths, reason);
  } else {
    setTripMiles(id, null, result.reason);
  }
  return getTrip(id);
}

// ── Marketing-event trips ────────────────────────────────────────────────────

/** What the expense form sends for "Add mileage for this event". */
export interface EventMileage {
  from: string;
  to: string;
  roundTrip: boolean;
  businessVehicleId: string | null;
  /** Miles typed by the owner (tenths, for the whole trip); null = look them up. */
  milesTenths: number | null;
}

function eventPurpose(e: Expense): string {
  const what = [e.vendor, e.note].filter(Boolean).join(' — ');
  return `Marketing event${what ? `: ${what}` : ''}`;
}

/**
 * Keep the trip logged with a marketing expense in step with it.
 *   mileage undefined  the expense was edited without touching mileage: carry
 *                      its date and description onto the trip, nothing else
 *   mileage null       mileage was removed: delete the trip
 *   mileage given      create or replace the trip (from → event, and back when
 *                      round trip) and look the distance up after the response.
 *                      A failed lookup leaves miles blank and flags the trip.
 */
export function syncExpenseTrip(
  expense: Expense,
  mileage: EventMileage | null | undefined,
  actorId: string
): Trip | null {
  const current = tripForExpense(expense.id);

  if (mileage === undefined) {
    if (!current) return null;
    return updateTrip(current.id, { ...current, tripDate: expense.spentOn, purpose: eventPurpose(expense) });
  }
  if (mileage === null) {
    if (current) deleteTrip(current.id);
    return null;
  }

  const businessVehicleId = mileage.businessVehicleId ?? defaultVehicleFor(expense.spentOn)?.id ?? null;
  const typed = mileage.milesTenths !== null;
  const input = {
    tripDate: expense.spentOn,
    businessVehicleId,
    startAddress: mileage.from,
    stops: [{ label: expense.vendor || 'Event', address: mileage.to }],
    endAddress: mileage.roundTrip ? mileage.from : mileage.to,
    purpose: eventPurpose(expense),
    // Typed miles are the owner's figure and are kept as given.
    milesTenths: mileage.milesTenths,
    source: typed ? ('manual' as const) : ('route' as const),
    odometerStart: null,
    odometerEnd: null,
    odometerStartKey: null,
    odometerEndKey: null,
    needsReview: !typed || !businessVehicleId,
    reviewReason: !typed ? CALCULATING : businessVehicleId ? '' : 'No vehicle chosen.',
    notes: current?.notes ?? '',
  };
  const trip = current ? updateTrip(current.id, input)! : createTrip(input, actorId, [], expense.id);
  if (!typed) recalculateTrip(trip.id).catch((e) => console.error('[mileage] recalculation failed', e));
  return trip;
}

// ── Year summaries ───────────────────────────────────────────────────────────

export interface VehicleYearSummary {
  vehicle: BusinessVehicle;
  businessMilesTenths: number;
  trips: number;
  pending: number;
  /** All miles driven that year from the odometer readings, when both are known. */
  totalMiles: number | null;
  /** 0–100, or null when total miles are unknown. Qualified nonpersonal-use = 100. */
  businessUsePct: number | null;
  rateMills: number | null;
  /** Standard-mileage vehicles only: business miles × the year's rate. */
  deductionCents: number | null;
}

export function totalMilesFor(vehicle: BusinessVehicle, year: number): number | null {
  const row = vehicle.years.find((y) => y.taxYear === year);
  if (!row || row.odometerEnd === null) return null;
  const placedThisYear = vehicle.placedInServiceOn?.startsWith(String(year)) ?? false;
  const start = row.odometerStart ?? (placedThisYear ? vehicle.odometerInService : null);
  if (start === null || row.odometerEnd < start) return null;
  return row.odometerEnd - start;
}

/** Cents for a distance at a rate: tenths × mills / 100. */
export function mileageDeductionCents(milesTenths: number, rateMills: number): number {
  return Math.round((milesTenths * rateMills) / 100);
}

export function vehicleYearSummaries(year: number): {
  vehicles: VehicleYearSummary[];
  unassigned: { milesTenths: number; trips: number; pending: number };
} {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const miles = milesByVehicle(from, to);
  const rateMills = mileageRateMills(year);

  const vehicles = listBusinessVehicles()
    .filter((v) => ((!v.activeFrom || v.activeFrom <= to) && (!v.retiredOn || v.retiredOn >= from)) || miles.has(v.id))
    .map((vehicle) => {
      const m = miles.get(vehicle.id) ?? { milesTenths: 0, trips: 0, pending: 0 };
      const totalMiles = totalMilesFor(vehicle, year);
      const businessUsePct = vehicle.qualifiedNonpersonal
        ? 100
        : totalMiles
          ? Math.min(100, (m.milesTenths / 10 / totalMiles) * 100)
          : null;
      return {
        vehicle,
        businessMilesTenths: m.milesTenths,
        trips: m.trips,
        pending: m.pending,
        totalMiles,
        businessUsePct,
        rateMills,
        deductionCents:
          vehicle.deductionMethod === 'standard' && rateMills !== null
            ? mileageDeductionCents(m.milesTenths, rateMills)
            : null,
      };
    });

  return { vehicles, unassigned: miles.get('') ?? { milesTenths: 0, trips: 0, pending: 0 } };
}

export const formatMiles = (tenths: number | null): string =>
  tenths === null ? '—' : (tenths / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

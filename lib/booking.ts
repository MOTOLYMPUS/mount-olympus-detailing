// ─────────────────────────────────────────────────────────────────────────────
// Booking orchestration.
//
// One place that knows the whole sequence of making, moving, and cancelling a
// booking, so the API routes stay thin and the rules cannot drift apart
// between "customer books" and "admin books on the phone".
//
// THE PRICE IS ALWAYS RECOMPUTED SERVER-SIDE from data/pricing, exactly as
// app/api/estimates/route.ts already does. A client that posts
// `{ quotedTotal: 1 }` gets the real number stored.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError } from './api';
import { assertBookable, durationForHours, withinCancellationWindow } from './availability';
import { calculateEstimate } from './pricing';
import { Appointment, LocationType, TIER_DISCOUNT, User } from './models';
import { Industry, SizeClass } from './types';
import {
  cancelAppointment,
  createAppointment,
  getAppointment,
  updateAppointment,
} from './repo/appointments';
import { ensureJob, getJobByAppointment } from './repo/jobs';
import { getVehicle } from './repo/vehicles';
import { getUser } from './repo/users';
import { getPriceOverrides } from './repo/pricing';
import { activeMembership, award, ensureLoyaltyAccount, getLoyaltyAccount } from './repo/loyalty';
import { getSchedulingConfig, getServiceArea } from './repo/settings';
import { getService } from '@/data/pricing';
import {
  sendBookingCancelled,
  sendBookingConfirmation,
  sendBookingRescheduled,
  sendJobComplete,
} from './notify-account';
import { AUDIT, audit } from './repo/audit';

export interface BookingRequest {
  customerId: string;
  vehicleId: string | null;
  /** Only honoured for staff; customers may express a preference. */
  employeeId?: string | null;
  industry: Industry;
  sizeClass: SizeClass;
  serviceIds: string[];
  addOnIds: string[];
  startsAt: string;
  locationType: LocationType;
  address: string;
  serviceAreaId?: string | null;
  notes: string;
  photoUrls?: string[];
  estimateId?: string | null;
  source?: string;
}

export interface PricedBooking {
  quotedTotal: number;
  quotedTotalMax: number;
  estimatedHours: number;
  durationMinutes: number;
  discountPercent: number;
  isPlaceholderPricing: boolean;
}

/**
 * Recompute price and duration from the catalogue, then apply the customer's
 * standing discount (membership plan or loyalty tier, whichever is better —
 * never both, which would compound into an unintended giveaway).
 */
export function priceBooking(input: {
  customerId: string;
  industry: Industry;
  sizeClass: SizeClass;
  serviceIds: string[];
  addOnIds: string[];
}): PricedBooking {
  const estimate = calculateEstimate({
    industry: input.industry,
    size: input.sizeClass,
    serviceIds: input.serviceIds,
    addOnIds: input.addOnIds,
    // Authoritative booking price uses the owner's admin overrides.
    overrides: getPriceOverrides(),
  });

  if (!estimate) {
    throw new ApiError('Those services are not available for that vehicle size.', 400, {
      serviceIds: 'Please choose at least one available service.',
    });
  }

  const membership = activeMembership(input.customerId);
  const loyalty = getLoyaltyAccount(input.customerId);
  const discountPercent = Math.max(
    membership?.plan.discountPct ?? 0,
    loyalty ? TIER_DISCOUNT[loyalty.tier] : 0
  );

  const apply = (n: number) => Math.round(n * (1 - discountPercent / 100));

  return {
    quotedTotal: apply(estimate.total),
    quotedTotalMax: apply(estimate.totalMax),
    estimatedHours: estimate.estimatedHours,
    durationMinutes: durationForHours(estimate.estimatedHours),
    discountPercent,
    isPlaceholderPricing: estimate.isPlaceholderPricing,
  };
}

/** Checklist seeded from the services sold, so a technician sees what to do. */
function checklistFor(serviceIds: string[]) {
  const items: { id: string; label: string; done: boolean }[] = [];
  for (const id of serviceIds) {
    const service = getService(id);
    if (!service) continue;
    // Prefer the service's own `includes` bullets — they are already the
    // customer-facing description of the work, so the technician's checklist
    // and the customer's expectations cannot diverge.
    const steps = service.includes?.length ? service.includes : [service.name];
    steps.forEach((label, i) => items.push({ id: `${id}-${i}`, label, done: false }));
  }
  return items;
}

export async function createBooking(
  request: BookingRequest,
  actor: User
): Promise<{ appointment: Appointment; pricing: PricedBooking }> {
  const customer = getUser(request.customerId);
  if (!customer) throw new ApiError('That customer no longer exists.', 404);

  // A vehicle must belong to the customer being booked for. Without this check
  // a caller could attach someone else's vehicle id and read its details back
  // through the appointment view.
  if (request.vehicleId) {
    const vehicle = getVehicle(request.vehicleId);
    if (!vehicle || vehicle.userId !== customer.id) {
      throw new ApiError('That vehicle is not in your garage.', 400, {
        vehicleId: 'Please choose one of your vehicles.',
      });
    }
  }

  const pricing = priceBooking(request);

  const travelMinutes =
    request.locationType === 'shop'
      ? 0
      : (request.serviceAreaId ? getServiceArea(request.serviceAreaId)?.travelMinutes : undefined) ??
        getSchedulingConfig().defaultTravelMinutes;

  // The authoritative availability check. This is what stops a double booking.
  const bookable = assertBookable({
    startsAt: request.startsAt,
    durationMinutes: pricing.durationMinutes,
    employeeId: request.employeeId ?? null,
    locationType: request.locationType,
    travelMinutes,
  });

  if (!bookable.ok || !bookable.window) {
    throw new ApiError(bookable.reason ?? 'That time is not available.', 409, {
      startsAt: bookable.reason ?? 'Please choose another time.',
    });
  }

  const depositPercent = getSchedulingConfig().depositPercent;

  const appointment = createAppointment({
    customerId: customer.id,
    vehicleId: request.vehicleId,
    employeeId: request.employeeId ?? null,
    estimateId: request.estimateId ?? null,
    industry: request.industry,
    sizeClass: request.sizeClass,
    serviceIds: request.serviceIds,
    addOnIds: request.addOnIds,
    locationType: request.locationType,
    address: request.address,
    serviceAreaId: request.serviceAreaId ?? null,
    startsAt: bookable.window.startsAt,
    endsAt: bookable.window.endsAt,
    travelMinutes: bookable.window.travelMinutes,
    bufferMinutes: bookable.window.bufferMinutes,
    quotedTotal: pricing.quotedTotal,
    quotedTotalMax: pricing.quotedTotalMax,
    estimatedHours: pricing.estimatedHours,
    depositCents: Math.round(pricing.quotedTotal * 100 * (depositPercent / 100)),
    notes: request.notes,
    photoUrls: request.photoUrls ?? [],
    source: request.source ?? 'app',
  });

  if (request.employeeId) {
    ensureJob(appointment.id, request.employeeId, checklistFor(request.serviceIds));
  }

  ensureLoyaltyAccount(customer.id);

  audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT.APPOINTMENT_CREATE,
    entity: 'appointment',
    entityId: appointment.id,
    meta: { reference: appointment.reference, total: appointment.quotedTotal },
  });

  // Notifications are best-effort: the booking exists and must not be rolled
  // back because an email bounced.
  sendBookingConfirmation(customer, appointment).catch((e) =>
    console.error('[booking] confirmation failed', e)
  );

  return { appointment, pricing };
}

export async function rescheduleBooking(
  appointmentId: string,
  newStartsAt: string,
  actor: User
): Promise<Appointment> {
  const appointment = getAppointment(appointmentId);
  if (!appointment) throw new ApiError('Booking not found.', 404);

  if (appointment.status === 'completed' || appointment.status === 'cancelled') {
    throw new ApiError('That booking can no longer be changed.', 409);
  }

  // Customers are held to the cancellation policy; staff can always override,
  // because someone has to be able to fix a genuine mistake.
  if (actor.role === 'customer' && !withinCancellationWindow(appointment.startsAt)) {
    const hours = getSchedulingConfig().cancellationNoticeHours;
    throw new ApiError(
      `Bookings can only be changed more than ${hours} hours ahead. Please call us.`,
      409
    );
  }

  const durationMinutes = Math.round(
    (new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60000
  );

  const bookable = assertBookable({
    startsAt: newStartsAt,
    durationMinutes,
    employeeId: appointment.employeeId,
    locationType: appointment.locationType,
    travelMinutes: appointment.travelMinutes,
    // Without this the booking would collide with its own current slot.
    ignoreAppointmentId: appointment.id,
  });

  if (!bookable.ok || !bookable.window) {
    throw new ApiError(bookable.reason ?? 'That time is not available.', 409);
  }

  const previousStart = appointment.startsAt;
  const updated = updateAppointment(appointment.id, {
    startsAt: bookable.window.startsAt,
    endsAt: bookable.window.endsAt,
    // A moved booking needs confirming again, and its old reminder is void.
    status: 'scheduled',
    remindedAt: undefined,
  })!;

  audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT.APPOINTMENT_UPDATE,
    entity: 'appointment',
    entityId: appointment.id,
    meta: { from: previousStart, to: updated.startsAt },
  });

  const customer = getUser(appointment.customerId);
  if (customer) {
    sendBookingRescheduled(customer, updated, previousStart).catch((e) =>
      console.error('[booking] reschedule email failed', e)
    );
  }

  return updated;
}

export async function cancelBooking(
  appointmentId: string,
  reason: string,
  actor: User
): Promise<Appointment> {
  const appointment = getAppointment(appointmentId);
  if (!appointment) throw new ApiError('Booking not found.', 404);
  if (appointment.status === 'cancelled') return appointment;
  if (appointment.status === 'completed') {
    throw new ApiError('A completed job cannot be cancelled.', 409);
  }

  if (actor.role === 'customer' && !withinCancellationWindow(appointment.startsAt)) {
    const hours = getSchedulingConfig().cancellationNoticeHours;
    throw new ApiError(
      `Free cancellation ends ${hours} hours before the appointment. Please call us and we will sort it out.`,
      409
    );
  }

  const cancelled = cancelAppointment(appointment.id, reason)!;

  audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT.APPOINTMENT_CANCEL,
    entity: 'appointment',
    entityId: appointment.id,
    meta: { reason },
  });

  const customer = getUser(appointment.customerId);
  if (customer) {
    sendBookingCancelled(customer, cancelled, reason).catch((e) =>
      console.error('[booking] cancel email failed', e)
    );
  }

  return cancelled;
}

/**
 * Mark the work done: closes the appointment, awards loyalty points, and tells
 * the customer their vehicle is ready.
 *
 * Points are awarded here rather than on payment so the programme works for a
 * business taking cash, and the loyalty ledger records the appointment id so a
 * double-completion can be spotted.
 */
export async function completeBooking(appointmentId: string, actor: User): Promise<Appointment> {
  const appointment = getAppointment(appointmentId);
  if (!appointment) throw new ApiError('Booking not found.', 404);
  if (appointment.status === 'completed') return appointment;

  const updated = updateAppointment(appointment.id, { status: 'completed' })!;

  const config = getSchedulingConfig();
  void config;

  const perDollar = 1;
  const points = Math.floor(appointment.quotedTotal * perDollar);
  if (points > 0) {
    award({
      userId: appointment.customerId,
      points,
      kind: 'earn',
      note: `Job ${appointment.reference}`,
      appointmentId: appointment.id,
    });
  }

  audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT.JOB_COMPLETE,
    entity: 'appointment',
    entityId: appointment.id,
    meta: { points },
  });

  const customer = getUser(appointment.customerId);
  if (customer) {
    sendJobComplete(customer, updated).catch((e) =>
      console.error('[booking] completion email failed', e)
    );
  }

  return updated;
}

/** Assign or reassign a technician, keeping the job record in step. */
export function assignTechnician(
  appointmentId: string,
  employeeId: string | null,
  actor: User
): Appointment {
  const appointment = getAppointment(appointmentId);
  if (!appointment) throw new ApiError('Booking not found.', 404);

  if (employeeId) {
    const employee = getUser(employeeId);
    if (!employee || employee.role === 'customer' || !employee.active) {
      throw new ApiError('That is not an active technician.', 400);
    }

    // Do not move a booking onto a technician who is already busy then.
    const clash = assertBookable({
      startsAt: appointment.startsAt,
      durationMinutes: Math.round(
        (new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60000
      ),
      employeeId,
      locationType: appointment.locationType,
      travelMinutes: appointment.travelMinutes,
      ignoreAppointmentId: appointment.id,
    });
    if (!clash.ok) {
      throw new ApiError(`That technician is not free then — ${clash.reason}`, 409);
    }
  }

  const updated = updateAppointment(appointmentId, { employeeId })!;
  if (employeeId) {
    ensureJob(appointmentId, employeeId, checklistFor(appointment.serviceIds));
  }

  audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: AUDIT.APPOINTMENT_ASSIGN,
    entity: 'appointment',
    entityId: appointmentId,
    meta: { employeeId },
  });

  return updated;
}

/** Ensure a job row exists for an appointment — used when staff open one. */
export function jobFor(appointment: Appointment) {
  return (
    getJobByAppointment(appointment.id) ??
    ensureJob(appointment.id, appointment.employeeId, checklistFor(appointment.serviceIds))
  );
}

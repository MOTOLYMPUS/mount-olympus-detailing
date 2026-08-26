// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/appointments/:id   — one booking, with its job and photos
// PATCH  /api/appointments/:id   — reschedule, assign, update status or notes
// DELETE /api/appointments/:id   — cancel (soft; the row is kept for history)
//
// Every verb loads the record FIRST and checks `canViewAppointment` /
// `canEditAppointment` against it. Role alone is never enough: an employee has
// the 'employee' role for every job in the system, but access to only theirs.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { ApiError, fail, ok, str, text, withAuth } from '@/lib/api';
import { assignTechnician, cancelBooking, completeBooking, jobFor, rescheduleBooking } from '@/lib/booking';
import { getAppointment, getAppointmentView, updateAppointment } from '@/lib/repo/appointments';
import { listJobPhotos } from '@/lib/repo/jobs';
import { canEditAppointment, canManage, canViewAppointment } from '@/lib/rbac';
import { APPOINTMENT_STATUSES, AppointmentStatus } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('any', async ({ user, params }) => {
  const appointment = getAppointmentView(params.id);
  if (!appointment) return fail('Booking not found.', 404);
  if (!canViewAppointment(user, appointment)) return fail('Booking not found.', 404);

  const job = jobFor(appointment);
  const photos = listJobPhotos(job.id);

  // A customer has no business seeing internal cost data or the technician's
  // private notes, so the job is projected down before it is returned.
  const projectedJob = canManage(user.role) || user.role === 'employee'
    ? job
    : {
        id: job.id,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        checklist: job.checklist,
        customerRating: job.customerRating,
        customerFeedback: job.customerFeedback,
      };

  return NextResponse.json({ ok: true, appointment, job: projectedJob, photos });
});

export const PATCH = withAuth('any', async ({ user, params, body }) => {
  const appointment = getAppointment(params.id);
  if (!appointment) return fail('Booking not found.', 404);
  if (!canEditAppointment(user, appointment)) return fail('Booking not found.', 404);

  const b = (body ?? {}) as Record<string, unknown>;

  try {
    // ── Reschedule ─────────────────────────────────────────────────────────
    const startsAt = str(b.startsAt, 40);
    if (startsAt) {
      const updated = await rescheduleBooking(
        appointment.id,
        new Date(startsAt).toISOString(),
        user
      );
      return ok({ appointment: updated });
    }

    // ── Assign a technician (staff only) ───────────────────────────────────
    if ('employeeId' in b) {
      if (!canManage(user.role)) return fail('You do not have access to that.', 403);
      const updated = assignTechnician(appointment.id, str(b.employeeId, 60) || null, user);
      return ok({ appointment: updated });
    }

    // ── Status ─────────────────────────────────────────────────────────────
    const status = str(b.status, 20) as AppointmentStatus;
    if (status) {
      if (!(APPOINTMENT_STATUSES as readonly string[]).includes(status)) {
        return fail('Unknown status.', 400);
      }
      // A customer may confirm their own booking and nothing else — marking
      // your own job 'completed' would award loyalty points for work that
      // never happened.
      if (user.role === 'customer' && status !== 'confirmed') {
        return fail('You do not have access to that.', 403);
      }
      if (status === 'completed') {
        const updated = await completeBooking(appointment.id, user);
        return ok({ appointment: updated });
      }
      const updated = updateAppointment(appointment.id, { status });
      return ok({ appointment: updated });
    }

    // ── Notes / address (staff, or the customer before it starts) ──────────
    const patch: Record<string, unknown> = {};
    if (typeof b.notes === 'string') patch.notes = text(b.notes, 2000);
    if (typeof b.address === 'string' && canManage(user.role)) patch.address = str(b.address, 200);

    if (!Object.keys(patch).length) return fail('Nothing to update.', 400);

    const updated = updateAppointment(appointment.id, patch);
    return ok({ appointment: updated });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.message, e.status, e.fields);
    throw e;
  }
});

export const DELETE = withAuth('any', async ({ user, params, query }) => {
  const appointment = getAppointment(params.id);
  if (!appointment) return fail('Booking not found.', 404);
  if (!canEditAppointment(user, appointment)) return fail('Booking not found.', 404);

  // An employee can work a job but cannot cancel a customer's booking.
  if (user.role === 'employee') return fail('Please ask a manager to cancel this.', 403);

  try {
    const cancelled = await cancelBooking(
      appointment.id,
      str(query.get('reason'), 300) || 'Cancelled by customer',
      user
    );
    return ok({ appointment: cancelled });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.message, e.status, e.fields);
    throw e;
  }
});

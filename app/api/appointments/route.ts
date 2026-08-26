// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/appointments   — list, scoped to who is asking
// POST /api/appointments   — create a booking
//
// SCOPING RULE: a customer sees only their own bookings, an employee sees only
// the ones assigned to them, and a manager sees everything. The scope is
// applied to the QUERY, not filtered after the fact — so there is no code path
// that loads someone else's rows and then discards them.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { ApiError, fail, ok, stringArray, str, text, withAuth } from '@/lib/api';
import { createBooking } from '@/lib/booking';
import { listAppointments } from '@/lib/repo/appointments';
import { AppointmentStatus, APPOINTMENT_STATUSES } from '@/lib/models';
import { canManage } from '@/lib/rbac';
import { isIndustry, SizeClass } from '@/lib/types';
import { getIndustry } from '@/lib/industries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('any', async ({ user, query }) => {
  const scope: { customerId?: string; employeeId?: string } = {};

  if (user.role === 'customer') scope.customerId = user.id;
  else if (user.role === 'employee') scope.employeeId = user.id;
  else if (canManage(user.role)) {
    // Managers may narrow voluntarily; the default is everything.
    const customer = query.get('customer');
    const employee = query.get('employee');
    if (customer) scope.customerId = customer;
    if (employee) scope.employeeId = employee;
  }

  const statusParam = query.get('status');
  const statuses = statusParam
    ? (statusParam
        .split(',')
        .filter((s): s is AppointmentStatus =>
          (APPOINTMENT_STATUSES as readonly string[]).includes(s)
        ))
    : undefined;

  const direction = query.get('direction');

  const appointments = listAppointments({
    ...scope,
    statuses,
    from: query.get('from') ?? undefined,
    to: query.get('to') ?? undefined,
    direction:
      direction === 'upcoming' || direction === 'past' || direction === 'all'
        ? direction
        : undefined,
    search: canManage(user.role) ? (query.get('q') ?? undefined) : undefined,
    limit: Math.min(200, Number(query.get('limit')) || 100),
    offset: Number(query.get('offset')) || 0,
  });

  return NextResponse.json({ ok: true, appointments });
});

export const POST = withAuth(
  'any',
  async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;

    const industry = b.industry;
    if (!isIndustry(industry)) return fail('Please choose a category.', 400);

    const sizeClass = str(b.sizeClass, 40) as SizeClass;
    if (!getIndustry(industry).sizes.some((s) => s.id === sizeClass)) {
      return fail('Please choose a size.', 400, { sizeClass: 'Please choose a size.' });
    }

    const serviceIds = stringArray(b.serviceIds, 20);
    if (!serviceIds.length) {
      return fail('Please choose a service.', 400, { serviceIds: 'Please choose at least one service.' });
    }

    const startsAt = str(b.startsAt, 40);
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
      return fail('Please choose a time.', 400, { startsAt: 'Please choose a time.' });
    }

    // A customer may only book FOR THEMSELVES. Staff booking on the phone can
    // name a customer; anyone else is pinned to their own id regardless of
    // what they posted.
    const customerId = canManage(user.role) ? str(b.customerId, 60) || user.id : user.id;

    // Likewise, only staff choose the technician.
    const employeeId = canManage(user.role) ? (str(b.employeeId, 60) || null) : null;

    const locationType = b.locationType === 'shop' ? 'shop' : 'mobile';
    const address = str(b.address, 200);
    if (locationType === 'mobile' && !address) {
      return fail('We need an address for mobile service.', 400, {
        address: 'Where should we come to?',
      });
    }

    try {
      const { appointment, pricing } = await createBooking(
        {
          customerId,
          vehicleId: str(b.vehicleId, 60) || null,
          employeeId,
          industry,
          sizeClass,
          serviceIds,
          addOnIds: stringArray(b.addOnIds, 20),
          startsAt: new Date(startsAt).toISOString(),
          locationType,
          address,
          serviceAreaId: str(b.serviceAreaId, 60) || null,
          notes: text(b.notes, 2000),
          photoUrls: stringArray(b.photoUrls, 10, 400),
          estimateId: str(b.estimateId, 60) || null,
          source: canManage(user.role) ? 'staff' : 'app',
        },
        user
      );

      return ok({ appointment, pricing }, { status: 201 });
    } catch (e) {
      if (e instanceof ApiError) return fail(e.message, e.status, e.fields);
      throw e;
    }
  },
  { limit: 'booking' }
);

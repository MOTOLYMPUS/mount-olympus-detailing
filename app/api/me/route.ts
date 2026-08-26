// ─────────────────────────────────────────────────────────────────────────────
// GET   /api/me — the signed-in user plus everything the app shell needs
// PATCH /api/me — update the user's own profile
//
// `role` and `active` are NOT readable from the PATCH body. Self-service
// profile editing is the classic privilege-escalation hole: a customer who can
// PATCH their own role owns the business.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, withAuth } from '@/lib/api';
import { updateUser } from '@/lib/repo/users';
import { validateProfile } from '@/lib/validation-account';
import { AUDIT, audit } from '@/lib/repo/audit';
import { activeMembership, ensureLoyaltyAccount } from '@/lib/repo/loyalty';
import { countVehicles } from '@/lib/repo/vehicles';
import { unreadCount } from '@/lib/repo/notifications';
import { totalUnread } from '@/lib/repo/messages';
import { listAppointments } from '@/lib/repo/appointments';
import { isStaff } from '@/lib/rbac';
import { TIER_DISCOUNT, toPublicUser } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('any', async ({ user }) => {
  const loyalty = ensureLoyaltyAccount(user.id);
  const membership = activeMembership(user.id);

  const upcoming = listAppointments({
    ...(isStaff(user.role) ? { employeeId: user.id } : { customerId: user.id }),
    direction: 'upcoming',
    statuses: ['scheduled', 'confirmed', 'in_progress'],
    limit: 3,
  });

  return NextResponse.json({
    ok: true,
    user: toPublicUser(user),
    loyalty: {
      points: loyalty.points,
      lifetimePoints: loyalty.lifetimePoints,
      tier: loyalty.tier,
      tierDiscountPercent: TIER_DISCOUNT[loyalty.tier],
      referralCode: loyalty.referralCode,
    },
    membership: membership
      ? { name: membership.plan.name, discountPct: membership.plan.discountPct, renewsAt: membership.renewsAt }
      : null,
    counts: {
      vehicles: countVehicles(user.id),
      unreadNotifications: unreadCount(user.id),
      unreadMessages: isStaff(user.role) ? totalUnread(user.id) : 0,
    },
    upcoming,
  });
});

export const PATCH = withAuth('any', async ({ user, body }) => {
  const result = validateProfile(body);
  if (!result.ok || !result.value) return fail('Please check the form.', 400, result.errors);

  // Only these four fields. Nothing else from the body is even looked at.
  const updated = updateUser(user.id, {
    name: result.value.name,
    phone: result.value.phone,
    address: result.value.address,
    smsConsent: result.value.smsConsent,
  });

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.USER_UPDATE,
    entity: 'user',
    entityId: user.id,
    meta: { self: true },
  });

  return ok({ user: updated ? toPublicUser(updated) : null });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/vehicles  — the signed-in customer's garage
// POST /api/vehicles  — add a vehicle
//
// Staff can read another customer's garage by passing ?user=<id> (needed to
// book on the phone), but never write to it.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, withAuth } from '@/lib/api';
import { createVehicle, listVehicles } from '@/lib/repo/vehicles';
import { validateVehicle } from '@/lib/validation-account';
import { canManage } from '@/lib/rbac';
import { unlockReferrerCoupons } from '@/lib/repo/coupons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('any', async ({ user, query }) => {
  const target = canManage(user.role) ? (query.get('user') ?? user.id) : user.id;
  const vehicles = listVehicles(target, query.get('archived') === '1');
  return NextResponse.json({ ok: true, vehicles });
});

export const POST = withAuth('any', async ({ user, body }) => {
  const result = validateVehicle(body);
  if (!result.ok || !result.value) return fail('Please check the form.', 400, result.errors);

  // Always the caller's own garage. There is deliberately no `userId` field
  // read from the body — a customer cannot add a vehicle to someone else's
  // account, and staff adding one on the phone go through the admin route.
  const vehicle = createVehicle(user.id, result.value);

  // Adding a vehicle is proof a referred sign-up was real: it unlocks the
  // referrer's pending coupon (no-op for everyone else).
  unlockReferrerCoupons(user.id);

  return ok({ vehicle }, { status: 201 });
});

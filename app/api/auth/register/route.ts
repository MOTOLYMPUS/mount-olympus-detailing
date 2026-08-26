// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
//
// Creates a customer account and signs them straight in. Staff accounts are
// NEVER created here — role is hard-coded to 'customer' and no role field is
// read from the body, so a crafted payload cannot mint an owner. Staff come
// only from /api/admin/employees, which itself requires an admin session.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie, checkPasswordPolicy, hashPassword, startSession } from '@/lib/auth';
import { createUser, getUserByEmail } from '@/lib/repo/users';
import { ensureLoyaltyAccount, findByReferralCode, award } from '@/lib/repo/loyalty';
import { createVehicle, countVehicles } from '@/lib/repo/vehicles';
import { listEstimateRequestsByEmail } from '@/lib/db';
import { AUDIT, audit } from '@/lib/repo/audit';
import { validateRegistration } from '@/lib/validation-account';
import { consume } from '@/lib/ratelimit';
import { clientIp, hashIp } from '@/lib/security';
import { fail } from '@/lib/api';
import { toPublicUser } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Points granted to the referrer once their friend signs up. */
const REFERRAL_BONUS = 250;

export async function POST(req: NextRequest) {
  const ipHash = hashIp(clientIp(req.headers));

  const limit = consume('register', ipHash ?? 'anonymous');
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many sign-up attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON.', 400);
  }

  const result = validateRegistration(body);
  if (!result.ok || !result.value) return fail('Please check the form.', 400, result.errors);
  const input = result.value;

  const policy = checkPasswordPolicy(input.password);
  if (!policy.ok) return fail('Please check the form.', 400, { password: policy.message! });

  // Do NOT disclose whether the address is already registered — that turns this
  // endpoint into an account-existence oracle. The generic message covers both
  // "taken" and "you already have an account", and the real owner of the
  // address can always use password reset.
  if (getUserByEmail(input.email)) {
    audit({ action: AUDIT.REGISTER, entity: 'user', meta: { outcome: 'duplicate' }, ipHash });
    return fail(
      'We could not create that account. If you already have one, try signing in or resetting your password.',
      409
    );
  }

  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = createUser({
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      smsConsent: input.smsConsent,
      role: 'customer',
    });
  } catch (e) {
    console.error('[register] create failed', e);
    return fail('We could not create your account. Please try again.', 500);
  }

  // ── Loyalty & referral ────────────────────────────────────────────────────
  const referrer = input.referralCode ? findByReferralCode(input.referralCode) : null;
  ensureLoyaltyAccount(user.id, referrer?.userId ?? null);

  if (referrer && referrer.userId !== user.id) {
    award({
      userId: referrer.userId,
      points: REFERRAL_BONUS,
      kind: 'referral',
      note: `Referred ${user.name}`,
    });
  }

  // ── Seed the garage from their estimate ─────────────────────────────────────
  // Most people who register came from the estimate flow, and that flow already
  // captured their vehicle (industry, type, size, make, model, year). Bringing
  // it in here means they land in the booking flow with a vehicle ready, rather
  // than on an empty garage — which is the whole point of "estimate → book".
  //
  // Linked by email (the register CTA prefills the estimate's address). Best
  // effort: a failure here must never fail the registration itself.
  try {
    if (countVehicles(user.id) === 0) {
      const recent = listEstimateRequestsByEmail(user.email, 1);
      const e = recent[0];
      if (e) {
        createVehicle(user.id, {
          industry: e.industry,
          vehicleType: e.vehicleType,
          sizeClass: e.sizeClass,
          year: e.year,
          make: e.make,
          model: e.model,
          isDefault: true,
        });
      }
    }
  } catch (e) {
    console.error('[register] estimate vehicle seed failed', e);
  }

  const { token, expiresAt } = startSession({
    userId: user.id,
    ipHash,
    userAgent: req.headers.get('user-agent') ?? '',
  });

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.REGISTER,
    entity: 'user',
    entityId: user.id,
    ipHash,
  });

  const res = NextResponse.json({ ok: true, user: toPublicUser(user) });
  return attachSessionCookie(res, token, expiresAt);
}

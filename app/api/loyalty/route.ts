// ─────────────────────────────────────────────────────────────────────────────
// GET /api/loyalty — the caller's points balance, tier, and ledger.
//
// Always scoped to the session user. There is no `?user=` parameter here even
// for managers: a points balance is customer data with no operational need
// behind an ad-hoc lookup, and the admin surface has its own route.
//
// ensureLoyaltyAccount() is idempotent (see lib/repo/loyalty.ts), so an account
// created before the loyalty programme existed gets one on first read rather
// than rendering an empty screen.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { LOYALTY_TIERS, TIER_DISCOUNT, TIER_THRESHOLDS } from '@/lib/models';
import { listCoupons } from '@/lib/repo/coupons';
import { ensureLoyaltyAccount, listLoyaltyEvents } from '@/lib/repo/loyalty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('any', async ({ user, query }) => {
  const account = ensureLoyaltyAccount(user.id);

  // Progress to the next tier, computed here so the client does not have to
  // reimplement the threshold table and drift from it.
  const currentIndex = LOYALTY_TIERS.indexOf(account.tier);
  const nextTier = LOYALTY_TIERS[currentIndex + 1] ?? null;
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null;

  return NextResponse.json({
    ok: true,
    account,
    // The coupon percent granted on reaching the current tier — a one-time
    // reward, not a standing rate. Actual usable coupons are in `coupons`.
    tierCouponPct: TIER_DISCOUNT[account.tier],
    coupons: listCoupons(user.id),
    nextTier,
    nextThreshold,
    pointsToNextTier: nextThreshold ? Math.max(0, nextThreshold - account.lifetimePoints) : 0,
    events: listLoyaltyEvents(user.id, Math.min(100, Number(query.get('limit')) || 50)),
  });
});

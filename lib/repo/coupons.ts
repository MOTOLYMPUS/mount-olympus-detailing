// ─────────────────────────────────────────────────────────────────────────────
// Coupons — one-time percentage-off rewards. They never expire.
//
// Lifecycle:
//   tier reached          → tier coupon AVAILABLE (one per tier, ever)
//   sign-up with a code   → referee coupon AVAILABLE, referrer coupon PENDING
//   referee adds a vehicle
//     or books a service  → referrer coupon AVAILABLE
//   next booking          → the booker's BEST available coupon is USED
//   that booking cancelled → the coupon goes back to AVAILABLE
//
// A referrer whose sign-up never adds a vehicle or books stays PENDING for
// ever and gets nothing — that is the rule, and it is what stops someone
// farming discounts with throwaway accounts.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, nowIso } from '../db';
import {
  Coupon,
  CouponKind,
  CouponStatus,
  LoyaltyTier,
  REFERRAL_DISCOUNT_PERCENT,
  ReferralRole,
  TIER_DISCOUNT,
} from '../models';

function toCoupon(row: Row): Coupon {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind as CouponKind,
    percent: row.percent,
    status: row.status as CouponStatus,
    tier: (row.tier as LoyaltyTier | null) ?? null,
    otherUserId: row.other_user_id ?? null,
    role: (row.role as ReferralRole | null) ?? null,
    appointmentId: row.appointment_id ?? null,
    createdAt: row.created_at,
    unlockedAt: row.unlocked_at ?? null,
    usedAt: row.used_at ?? null,
  };
}

// ── Granting ─────────────────────────────────────────────────────────────────

/**
 * Grant the tier's coupon once. Called by loyalty.award() for every tier the
 * customer's lifetime points crossed. Idempotent per (user, tier), so a replay
 * of the points ledger cannot hand out a second Gold coupon.
 */
export function grantTierCoupon(userId: string, tier: LoyaltyTier): boolean {
  const percent = TIER_DISCOUNT[tier];
  if (percent <= 0) return false;

  const db = getDb();
  const exists = db
    .prepare(`SELECT 1 FROM coupons WHERE user_id = ? AND kind = 'tier' AND tier = ?`)
    .get(userId, tier);
  if (exists) return false;

  const now = nowIso();
  db.prepare(
    `INSERT INTO coupons (id, user_id, kind, percent, status, tier, created_at, unlocked_at)
     VALUES (?, ?, 'tier', ?, 'available', ?, ?, ?)`
  ).run(crypto.randomUUID(), userId, percent, tier, now, now);
  return true;
}

/**
 * Called once at registration. Idempotent per pair, and refuses a self-referral
 * (the register route already prevents it, but the rule lives with the data).
 */
export function createReferralCoupons(refereeId: string, referrerId: string): void {
  if (refereeId === referrerId) return;
  const db = getDb();
  const exists = db
    .prepare(
      `SELECT 1 FROM coupons WHERE user_id = ? AND other_user_id = ? AND kind = 'referral' AND role = 'referee'`
    )
    .get(refereeId, referrerId);
  if (exists) return;

  const now = nowIso();
  const insert = db.prepare(
    `INSERT INTO coupons (id, user_id, kind, percent, status, other_user_id, role, created_at, unlocked_at)
     VALUES (?, ?, 'referral', ?, ?, ?, ?, ?, ?)`
  );
  db.exec('BEGIN');
  try {
    // The new customer's discount is theirs immediately — it is the reason
    // they typed the code.
    insert.run(crypto.randomUUID(), refereeId, REFERRAL_DISCOUNT_PERCENT, 'available', referrerId, 'referee', now, now);
    // The referrer's waits for proof the sign-up was real.
    insert.run(crypto.randomUUID(), referrerId, REFERRAL_DISCOUNT_PERCENT, 'pending', refereeId, 'referrer', now, null);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * The referee did something real (added a vehicle, or booked). Unlock every
 * pending referrer coupon that was waiting on them. Returns how many.
 */
export function unlockReferrerCoupons(refereeId: string): number {
  const result = getDb()
    .prepare(
      `UPDATE coupons SET status = 'available', unlocked_at = ?
        WHERE other_user_id = ? AND kind = 'referral' AND role = 'referrer' AND status = 'pending'`
    )
    .run(nowIso(), refereeId);
  return Number(result.changes);
}

// ── Spending ─────────────────────────────────────────────────────────────────

/** The best coupon the customer can spend right now (highest percent, then oldest). */
export function bestAvailableCoupon(userId: string): Coupon | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM coupons WHERE user_id = ? AND status = 'available'
        ORDER BY percent DESC, created_at ASC LIMIT 1`
    )
    .get(userId) as Row | undefined;
  return row ? toCoupon(row) : null;
}

/** Spend a coupon on a booking. No-op if it is no longer available (raced). */
export function consumeCoupon(id: string, appointmentId: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE coupons SET status = 'used', used_at = ?, appointment_id = ?
        WHERE id = ? AND status = 'available'`
    )
    .run(nowIso(), appointmentId, id);
  return Number(result.changes) > 0;
}

/** A booking that spent a coupon was cancelled: give the coupon back. */
export function releaseCoupon(appointmentId: string): void {
  getDb()
    .prepare(
      `UPDATE coupons SET status = 'available', used_at = NULL, appointment_id = NULL
        WHERE appointment_id = ? AND status = 'used'`
    )
    .run(appointmentId);
}

export function listCoupons(userId: string): Coupon[] {
  const rows = getDb()
    .prepare(`SELECT * FROM coupons WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as Row[];
  return rows.map(toCoupon);
}

/** Human label for a coupon, used on the rewards page and the booking summary. */
export function couponLabel(c: Pick<Coupon, 'kind' | 'tier' | 'role' | 'percent'>): string {
  if (c.kind === 'tier' && c.tier) {
    const name = c.tier.charAt(0).toUpperCase() + c.tier.slice(1);
    return `${name} tier reward · ${c.percent}% off`;
  }
  return c.role === 'referrer'
    ? `Referral thank-you · ${c.percent}% off`
    : `Welcome referral · ${c.percent}% off`;
}

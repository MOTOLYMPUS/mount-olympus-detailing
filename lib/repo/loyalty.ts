// ─────────────────────────────────────────────────────────────────────────────
// Loyalty, referrals, and memberships.
//
// Points are an EVENT LOG with a cached balance, not a bare counter. Every
// change writes a `loyalty_events` row, so "why do I have 340 points?" is
// always answerable and an accounting error is recoverable by replay.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, bool, flag, getDb, json, nowIso } from '../db';
import {
  LOYALTY_TIERS,
  LoyaltyAccount,
  LoyaltyEvent,
  LoyaltyTier,
  Membership,
  MembershipPlan,
  TIER_THRESHOLDS,
} from '../models';
import { grantTierCoupon } from './coupons';

/** Unambiguous alphabet — no O/0/I/1 — so a code can be read over the phone. */
function referralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function tierFor(lifetimePoints: number): LoyaltyTier {
  let tier: LoyaltyTier = 'bronze';
  for (const t of LOYALTY_TIERS) {
    if (lifetimePoints >= TIER_THRESHOLDS[t]) tier = t;
  }
  return tier;
}

function toAccount(row: Row): LoyaltyAccount {
  return {
    userId: row.user_id,
    points: row.points,
    lifetimePoints: row.lifetime_points,
    tier: row.tier as LoyaltyTier,
    referralCode: row.referral_code,
    referredBy: row.referred_by ?? null,
    updatedAt: row.updated_at,
  };
}

/** Idempotent — safe to call on every dashboard render. */
export function ensureLoyaltyAccount(userId: string, referredBy?: string | null): LoyaltyAccount {
  const existing = getLoyaltyAccount(userId);
  if (existing) return existing;

  // A collision on the 6-character code is possible; retry rather than fail a
  // registration over it.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      getDb()
        .prepare(
          `INSERT INTO loyalty_accounts (user_id, points, lifetime_points, tier, referral_code, referred_by, updated_at)
           VALUES (?, 0, 0, 'bronze', ?, ?, ?)`
        )
        .run(userId, referralCode(), referredBy ?? null, nowIso());
      break;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  return getLoyaltyAccount(userId)!;
}

export function getLoyaltyAccount(userId: string): LoyaltyAccount | null {
  const row = getDb().prepare(`SELECT * FROM loyalty_accounts WHERE user_id = ?`).get(userId) as
    | Row
    | undefined;
  return row ? toAccount(row) : null;
}

export function findByReferralCode(code: string): LoyaltyAccount | null {
  const row = getDb()
    .prepare(`SELECT * FROM loyalty_accounts WHERE referral_code = ?`)
    .get(code.trim().toUpperCase()) as Row | undefined;
  return row ? toAccount(row) : null;
}

export interface AwardInput {
  userId: string;
  points: number;
  kind: LoyaltyEvent['kind'];
  note: string;
  appointmentId?: string | null;
}

/**
 * Apply a points change. Positive earns, negative redeems.
 *
 * `lifetime_points` only ever increases — spending points must not demote a
 * customer's tier, which would be an unpleasant surprise for someone who used
 * the reward the programme encouraged them to use.
 */
export function award(input: AwardInput): LoyaltyAccount {
  const account = ensureLoyaltyAccount(input.userId);
  const db = getDb();

  const nextPoints = Math.max(0, account.points + input.points);
  const nextLifetime = account.lifetimePoints + Math.max(0, input.points);

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO loyalty_events (id, user_id, kind, points, note, appointment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      input.userId,
      input.kind,
      input.points,
      input.note,
      input.appointmentId ?? null,
      nowIso()
    );

    db.prepare(
      `UPDATE loyalty_accounts SET points = ?, lifetime_points = ?, tier = ?, updated_at = ?
        WHERE user_id = ?`
    ).run(nextPoints, nextLifetime, tierFor(nextLifetime), nowIso(), input.userId);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  // Reaching a tier earns its one-time coupon. Every tier crossed by this
  // award is granted — a big first job can carry someone straight past Silver
  // into Gold, and they reached both. grantTierCoupon is idempotent per tier.
  for (const t of LOYALTY_TIERS) {
    if (TIER_THRESHOLDS[t] > account.lifetimePoints && TIER_THRESHOLDS[t] <= nextLifetime) {
      grantTierCoupon(input.userId, t);
    }
  }

  return getLoyaltyAccount(input.userId)!;
}

export function listLoyaltyEvents(userId: string, limit = 50): LoyaltyEvent[] {
  const rows = getDb()
    .prepare(`SELECT * FROM loyalty_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as Row[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    points: r.points,
    note: r.note,
    appointmentId: r.appointment_id ?? null,
    createdAt: r.created_at,
  }));
}

/** Points earned for a completed job, from the `loyalty_points_per_dollar` setting. */
export function pointsForSpend(dollars: number, perDollar: number): number {
  return Math.max(0, Math.floor(dollars * perDollar));
}

// ── Memberships ──────────────────────────────────────────────────────────────

function toPlan(row: Row): MembershipPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    interval: row.interval,
    discountPct: row.discount_pct,
    included: json<string[]>(row.included, []),
    active: bool(row.active),
  };
}

export function listPlans(activeOnly = true): MembershipPlan[] {
  const rows = getDb()
    .prepare(`SELECT * FROM membership_plans${activeOnly ? ' WHERE active = 1' : ''} ORDER BY price_cents`)
    .all() as Row[];
  return rows.map(toPlan);
}

export function upsertPlan(plan: Omit<MembershipPlan, 'id'> & { id?: string }): MembershipPlan {
  const id = plan.id ?? crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO membership_plans (id, name, description, price_cents, interval, discount_pct, included, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, description = excluded.description,
         price_cents = excluded.price_cents, interval = excluded.interval,
         discount_pct = excluded.discount_pct, included = excluded.included,
         active = excluded.active`
    )
    .run(
      id,
      plan.name,
      plan.description,
      plan.priceCents,
      plan.interval,
      plan.discountPct,
      JSON.stringify(plan.included),
      flag(plan.active)
    );
  const row = getDb().prepare(`SELECT * FROM membership_plans WHERE id = ?`).get(id) as Row;
  return toPlan(row);
}

function toMembership(row: Row): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    startedAt: row.started_at,
    renewsAt: row.renews_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    providerRef: row.provider_ref ?? null,
  };
}

export function activeMembership(userId: string): (Membership & { plan: MembershipPlan }) | null {
  const row = getDb()
    .prepare(
      `SELECT m.*, p.name AS p_name, p.description AS p_description, p.price_cents AS p_price,
              p.interval AS p_interval, p.discount_pct AS p_discount, p.included AS p_included,
              p.active AS p_active
         FROM memberships m JOIN membership_plans p ON p.id = m.plan_id
        WHERE m.user_id = ? AND m.status = 'active'
        ORDER BY m.started_at DESC LIMIT 1`
    )
    .get(userId) as Row | undefined;
  if (!row) return null;

  return {
    ...toMembership(row),
    plan: {
      id: row.plan_id,
      name: row.p_name,
      description: row.p_description,
      priceCents: row.p_price,
      interval: row.p_interval,
      discountPct: row.p_discount,
      included: json<string[]>(row.p_included, []),
      active: bool(row.p_active),
    },
  };
}

export function createMembership(input: {
  userId: string;
  planId: string;
  renewsAt: string | null;
  providerRef?: string | null;
}): Membership {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO memberships (id, user_id, plan_id, status, started_at, renews_at, provider_ref)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`
    )
    .run(id, input.userId, input.planId, nowIso(), input.renewsAt, input.providerRef ?? null);
  const row = getDb().prepare(`SELECT * FROM memberships WHERE id = ?`).get(id) as Row;
  return toMembership(row);
}

export function cancelMembership(id: string): void {
  getDb()
    .prepare(`UPDATE memberships SET status = 'cancelled', cancelled_at = ? WHERE id = ?`)
    .run(nowIso(), id);
}

export function membershipStats(): { active: number; byPlan: { plan: string; count: number }[] } {
  const total = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM memberships WHERE status = 'active'`)
    .get() as { n: number };
  const rows = getDb()
    .prepare(
      `SELECT p.name AS plan, COUNT(*) AS n
         FROM memberships m JOIN membership_plans p ON p.id = m.plan_id
        WHERE m.status = 'active' GROUP BY m.plan_id ORDER BY n DESC`
    )
    .all() as Row[];
  return {
    active: Number(total.n),
    byPlan: rows.map((r) => ({ plan: r.plan, count: Number(r.n) })),
  };
}

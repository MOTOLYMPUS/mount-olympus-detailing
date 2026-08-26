// ─────────────────────────────────────────────────────────────────────────────
// Generic rate limiting.
//
// Backed by the same SQLite database as everything else so limits survive a
// restart and hold across workers — an in-memory Map would reset on every
// deploy and count nothing on a multi-process host.
//
// ⚠️  This is a *fixed-window* counter, not a token bucket: a caller can burst
// 2× the limit across a window boundary. That is an accepted trade for the
// abuse this actually defends against (credential stuffing, quote spam, AI
// cost). If you need strict smoothing, move to Redis with a sliding log.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb, nowIso } from './db';

export interface LimitRule {
  /** Maximum attempts allowed inside the window. */
  max: number;
  windowMs: number;
}

/**
 * Named buckets. Keeping them in one table makes the whole policy legible and
 * tunable in a single place.
 */
export const LIMITS = {
  login: { max: 8, windowMs: 15 * 60 * 1000 },
  register: { max: 5, windowMs: 60 * 60 * 1000 },
  passwordReset: { max: 5, windowMs: 60 * 60 * 1000 },
  booking: { max: 20, windowMs: 60 * 60 * 1000 },
  assistant: { max: 40, windowMs: 60 * 60 * 1000 },
  upload: { max: 60, windowMs: 60 * 60 * 1000 },
  message: { max: 120, windowMs: 60 * 60 * 1000 },
  api: { max: 300, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, LimitRule>;

export type LimitBucket = keyof typeof LIMITS;

export interface LimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window clears — sent as Retry-After. */
  retryAfter: number;
}

/**
 * Record an attempt and report whether it is allowed.
 *
 * `subject` should be an IP hash for anonymous endpoints and a user id for
 * authenticated ones. For login it is the hashed IP *and* the submitted email,
 * called twice, so one attacker cannot lock out an entire office NAT by
 * hammering one account.
 */
export function consume(bucket: LimitBucket, subject: string): LimitResult {
  const rule = LIMITS[bucket];
  const db = getDb();
  const since = new Date(Date.now() - rule.windowMs).toISOString();

  try {
    // Opportunistic cleanup — cheap, indexed, and keeps the table from growing
    // without bound on a long-running instance.
    db.prepare(`DELETE FROM rate_limits WHERE bucket = ? AND subject = ? AND created_at < ?`).run(
      bucket,
      subject,
      since
    );

    const row = db
      .prepare(
        `SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM rate_limits
          WHERE bucket = ? AND subject = ? AND created_at >= ?`
      )
      .get(bucket, subject, since) as { n: number; oldest: string | null };

    const used = Number(row.n);
    if (used >= rule.max) {
      const oldestMs = row.oldest ? new Date(row.oldest).getTime() : Date.now();
      const retryAfter = Math.max(1, Math.ceil((oldestMs + rule.windowMs - Date.now()) / 1000));
      return { ok: false, remaining: 0, retryAfter };
    }

    db.prepare(`INSERT INTO rate_limits (bucket, subject, created_at) VALUES (?, ?, ?)`).run(
      bucket,
      subject,
      nowIso()
    );

    return { ok: true, remaining: rule.max - used - 1, retryAfter: 0 };
  } catch (e) {
    // Fail OPEN. A rate-limit table problem must not lock every customer out of
    // their account; the error is loud so it gets fixed.
    console.error('[ratelimit] check failed — allowing request', bucket, e);
    return { ok: true, remaining: 0, retryAfter: 0 };
  }
}

/** Clear a subject's attempts — called after a successful login. */
export function reset(bucket: LimitBucket, subject: string): void {
  try {
    getDb().prepare(`DELETE FROM rate_limits WHERE bucket = ? AND subject = ?`).run(bucket, subject);
  } catch (e) {
    console.error('[ratelimit] reset failed', e);
  }
}

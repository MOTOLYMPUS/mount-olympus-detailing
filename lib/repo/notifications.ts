// ─────────────────────────────────────────────────────────────────────────────
// In-app notifications and Web Push subscriptions.
//
// The two are deliberately separate: a notification row is the durable record
// the user sees in their bell menu, and a push subscription is one *transport*
// for delivering it. A user with no push permission still gets every
// notification; they just see it next time they open the app.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, nowIso } from '../db';
import { AppNotification, PushSubscriptionRecord } from '../models';

function toNotification(row: Row): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    url: row.url ?? null,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  };
}

export function createNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  url?: string | null;
}): AppNotification {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO notifications (id, user_id, kind, title, body, url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.userId, input.kind, input.title, input.body ?? '', input.url ?? null, nowIso());
  const row = getDb().prepare(`SELECT * FROM notifications WHERE id = ?`).get(id) as Row;
  return toNotification(row);
}

export function listNotifications(userId: string, limit = 50): AppNotification[] {
  const rows = getDb()
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as Row[];
  return rows.map(toNotification);
}

export function unreadCount(userId: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`)
    .get(userId) as { n: number };
  return Number(row.n);
}

export function markRead(userId: string, id?: string): void {
  if (id) {
    getDb()
      .prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?`)
      .run(nowIso(), id, userId);
  } else {
    getDb()
      .prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`)
      .run(nowIso(), userId);
  }
}

// ── Push subscriptions ───────────────────────────────────────────────────────

function toSubscription(row: Row): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    failedAt: row.failed_at ?? null,
  };
}

/**
 * Endpoints are unique across the whole table. A browser re-registering after
 * a service-worker update produces the same endpoint, so upsert rather than
 * accumulating duplicates that would each get their own copy of every push.
 */
export function saveSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh  = excluded.p256dh,
         auth    = excluded.auth,
         failed_at = NULL`
    )
    .run(
      crypto.randomUUID(),
      input.userId,
      input.endpoint,
      input.p256dh,
      input.auth,
      input.userAgent.slice(0, 400),
      nowIso()
    );
}

export function listSubscriptions(userId: string): PushSubscriptionRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM push_subscriptions WHERE user_id = ? AND failed_at IS NULL`)
    .all(userId) as Row[];
  return rows.map(toSubscription);
}

export function deleteSubscription(endpoint: string): void {
  getDb().prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

/**
 * A 404 or 410 from a push service means the subscription is permanently dead
 * (app uninstalled, permission revoked) — delete it rather than retrying it
 * forever. Any other failure is transient and only marked.
 */
export function markSubscriptionFailed(endpoint: string, permanent: boolean): void {
  if (permanent) deleteSubscription(endpoint);
  else
    getDb()
      .prepare(`UPDATE push_subscriptions SET failed_at = ? WHERE endpoint = ?`)
      .run(nowIso(), endpoint);
}

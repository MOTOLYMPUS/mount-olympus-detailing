// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — owner notifications.
//
// Thin layer over lib/push.ts `notifyUser`, which already writes the durable
// notification row and then makes a best-effort push. Nothing here re-implements
// that; this file only answers two questions lib/push.ts does not:
//
//   WHO is "the owner"?  — every active owner and admin account. Looked up each
//   time rather than cached, so an admin added this morning gets this evening's
//   alerts without a restart.
//
//   Should this be sent AT ALL? — routine agent chatter must not reach a phone.
//   The suppression window below is the difference between a system the owner
//   keeps notifications on for and one they mute in week two, after which the
//   genuinely urgent alert is never seen either.
// ─────────────────────────────────────────────────────────────────────────────

import { listUsers } from '../repo/users';
import { notifyUser } from '../push';
import { getDb, nowIso } from '../db';
import { ensureJarvisSchema } from './schema';
import { logError } from './logs';

export interface OwnerAlert {
  title: string;
  body: string;
  url?: string;
  /** Bypasses the duplicate-suppression window. Use sparingly. */
  urgent?: boolean;
  agent?: string;
  /**
   * Identifies "the same alert" for suppression. Defaults to the title, which
   * is usually right — two identical titles an hour apart is the same news.
   */
  key?: string;
}

/**
 * Repeat suppression window. An agent that fails every ten minutes would
 * otherwise send 144 identical push notifications a day.
 */
const SUPPRESS_MS = 6 * 60 * 60 * 1000;

/**
 * Suppression is checked against the notifications table rather than an
 * in-memory Set, so it survives a restart — the failure this guards against
 * (a crash loop) is exactly the case where the process keeps restarting.
 */
function recentlySent(key: string): boolean {
  const since = new Date(Date.now() - SUPPRESS_MS).toISOString();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM notifications
        WHERE kind = 'jarvis' AND title = ? AND created_at >= ?`
    )
    .get(key.slice(0, 120), since) as { n: number };
  return Number(row.n) > 0;
}

export function ownerIds(): string[] {
  return listUsers({ roles: ['owner', 'admin'], activeOnly: true, limit: 20 }).map((u) => u.id);
}

/** Returns how many accounts were notified. Never throws. */
export async function notifyOwners(alert: OwnerAlert): Promise<number> {
  try {
    ensureJarvisSchema();
    const title = alert.title.slice(0, 120);

    if (!alert.urgent && recentlySent(alert.key ?? title)) return 0;

    const ids = ownerIds();
    await Promise.all(
      ids.map((id) =>
        notifyUser(id, {
          kind: 'jarvis',
          title,
          body: alert.body.slice(0, 500),
          url: alert.url ?? '/jarvis',
        })
      )
    );
    return ids.length;
  } catch (e) {
    logError(alert.agent ?? 'jarvis', 'Owner notification failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}

// ── Named events ─────────────────────────────────────────────────────────────
//
// The events the spec calls for, as named functions rather than call sites
// composing their own strings — so the wording of "a new lead arrived" is
// consistent wherever it is raised.

export const notifyNewLead = (name: string, detail: string) =>
  notifyOwners({
    title: `New lead: ${name}`,
    body: detail,
    url: '/admin/estimates',
    urgent: true,
    key: `lead:${name}:${nowIso().slice(0, 13)}`,
  });

export const notifyNewBooking = (name: string, when: string) =>
  notifyOwners({
    title: `New booking: ${name}`,
    body: when,
    url: '/admin/appointments',
    urgent: true,
  });

export const notifyAgentFailure = (agent: string, error: string) =>
  notifyOwners({
    title: `Agent failing: ${agent}`,
    body: error.slice(0, 300),
    url: '/jarvis/activity',
    key: `agent-failure:${agent}`,
  });

export const notifyApprovalsWaiting = (count: number) =>
  notifyOwners({
    title: `${count} item${count === 1 ? '' : 's'} waiting for your approval`,
    body: 'Jarvis has drafted work that needs your yes before it goes out.',
    url: '/jarvis/approvals',
    key: 'approvals-waiting',
  });

export const notifyRevenueMilestone = (milestone: string, detail: string) =>
  notifyOwners({
    title: `Milestone: ${milestone}`,
    body: detail,
    url: '/jarvis',
    urgent: true,
    key: `milestone:${milestone}`,
  });

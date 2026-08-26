// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — the approval queue.
//
// This is the safety spine of the whole system. An agent cannot send an email,
// post to Facebook, or change the website; it can only describe what it wants
// to do, in the exact arguments the connector will receive, and stop. Nothing
// leaves the building without a row here reaching `approved`.
//
// THE PAYLOAD IS THE MESSAGE, NOT A SUMMARY OF IT. The dashboard renders
// `payload`, and `payload` is what the connector is later called with. If those
// two could drift, the owner would be approving one thing and sending another —
// which is the single worst failure this system could have.
//
// This file is storage and state transitions only. Execution lives in
// lib/jarvis/connectors/index.ts, so that the record of a decision cannot be
// coupled to the availability of a third-party API.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { ensureJarvisSchema } from './schema';
import { Channel } from './config';
import { getPolicy } from './config';
import { log } from './logs';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'expired';

export type Risk = 'low' | 'medium' | 'high';

export interface Approval {
  id: string;
  taskId: string | null;
  agent: string;
  channel: Channel | string;
  action: string;
  summary: string;
  payload: Record<string, unknown>;
  risk: Risk;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  executedAt: string | null;
  result: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApprovalInput {
  taskId?: string | null;
  agent: string;
  channel: Channel | string;
  action: string;
  summary: string;
  payload: Record<string, unknown>;
  risk?: Risk;
}

function toApproval(row: Row): Approval {
  return {
    id: row.id,
    taskId: row.task_id,
    agent: row.agent,
    channel: row.channel,
    action: row.action,
    summary: row.summary,
    payload: json<Record<string, unknown>>(row.payload, {}),
    risk: row.risk,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    executedAt: row.executed_at,
    result: row.result,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

// ── Create ───────────────────────────────────────────────────────────────────

export function requestApproval(input: ApprovalInput): Approval {
  ensureJarvisSchema();
  const id = crypto.randomUUID();
  const now = nowIso();
  const ttlHours = getPolicy().approvalTtlHours;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  getDb()
    .prepare(
      `INSERT INTO jarvis_approvals
         (id, task_id, agent, channel, action, summary, payload, risk, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(
      id,
      input.taskId ?? null,
      input.agent,
      input.channel,
      input.action,
      input.summary.slice(0, 500),
      JSON.stringify(input.payload),
      input.risk ?? 'medium',
      expiresAt,
      now
    );

  log({
    taskId: input.taskId ?? null,
    agent: input.agent,
    level: 'info',
    message: `Approval requested: ${input.summary}`,
    meta: { channel: input.channel, action: input.action, approvalId: id },
  });

  return getApproval(id)!;
}

// ── Decide ───────────────────────────────────────────────────────────────────

/**
 * Record the owner's decision. Guarded on `status = 'pending'` so a double
 * click, or an approve racing an expiry sweep, cannot approve something twice —
 * which for an email connector would mean the customer receiving it twice.
 */
export function decide(
  id: string,
  decision: 'approved' | 'rejected',
  opts: { userId: string; note?: string }
): Approval | null {
  ensureJarvisSchema();
  const now = nowIso();

  const result = getDb()
    .prepare(
      `UPDATE jarvis_approvals
          SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?
        WHERE id = ? AND status = 'pending'`
    )
    .run(decision, opts.userId, now, (opts.note ?? '').slice(0, 500), id);

  if (Number(result.changes ?? 0) === 0) return null;

  const approval = getApproval(id)!;
  log({
    taskId: approval.taskId,
    agent: approval.agent,
    level: 'info',
    message: `Approval ${decision}: ${approval.summary}`,
    meta: { approvalId: id, channel: approval.channel },
  });
  return approval;
}

export function markExecuted(
  id: string,
  outcome: { ok: boolean; result: string }
): void {
  ensureJarvisSchema();
  getDb()
    .prepare(
      `UPDATE jarvis_approvals
          SET status = ?, executed_at = ?, result = ?
        WHERE id = ? AND status = 'approved'`
    )
    .run(outcome.ok ? 'executed' : 'failed', nowIso(), outcome.result.slice(0, 2000), id);
}

/**
 * Expire stale requests. A three-day-old draft reminder for an appointment that
 * has already happened must not be sendable — silence is the safe outcome, so
 * the sweep runs from the supervisor's routine pass rather than on demand.
 */
export function expireStale(): number {
  ensureJarvisSchema();
  const result = getDb()
    .prepare(
      `UPDATE jarvis_approvals
          SET status = 'expired'
        WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?`
    )
    .run(nowIso());

  const n = Number(result.changes ?? 0);
  if (n > 0) log({ agent: 'supervisor', level: 'warn', message: `Expired ${n} stale approval(s)` });
  return n;
}

// ── Read ─────────────────────────────────────────────────────────────────────

export function getApproval(id: string): Approval | null {
  ensureJarvisSchema();
  const row = getDb().prepare(`SELECT * FROM jarvis_approvals WHERE id = ?`).get(id) as
    | Row
    | undefined;
  return row ? toApproval(row) : null;
}

export function listApprovals(
  opts: { status?: ApprovalStatus; agent?: string; limit?: number } = {}
): Approval[] {
  ensureJarvisSchema();
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts.status) {
    where.push('status = ?');
    values.push(opts.status);
  }
  if (opts.agent) {
    where.push('agent = ?');
    values.push(opts.agent);
  }
  values.push(Math.min(opts.limit ?? 100, 500));

  const rows = getDb()
    .prepare(
      `SELECT * FROM jarvis_approvals${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY
         CASE status WHEN 'pending' THEN 0 ELSE 1 END,
         CASE risk WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  return rows.map(toApproval);
}

export function pendingCount(): number {
  ensureJarvisSchema();
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM jarvis_approvals WHERE status = 'pending'`)
    .get() as { n: number };
  return Number(row.n);
}

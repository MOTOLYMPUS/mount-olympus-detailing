// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — the task queue.
//
// Every piece of agent work is a row in `jarvis_tasks`. Agents do not call each
// other; they enqueue. That is the whole reason a ninth agent can be added
// later without touching the eight that exist.
//
// THREE THINGS THIS FILE GETS RIGHT, DELIBERATELY:
//
// 1. Claiming is atomic — `UPDATE … WHERE status='queued' … RETURNING`. Two
//    orchestrator ticks overlapping (a slow tick plus its scheduled successor)
//    must never hand the same task to two workers, and a SELECT-then-UPDATE
//    pair cannot promise that.
//
// 2. Duplicate suppression is a database constraint, not an `if`. The partial
//    unique index in schema.ts is the only thing that actually holds under a
//    race; enqueue() catches its violation and returns the existing row.
//
// 3. A crash cannot strand a task. Claims carry a lease; `reclaimStalled()`
//    returns anything whose lease expired to the queue. Without it, a process
//    killed mid-task leaves a row 'running' forever and that work silently
//    never happens again.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { ensureJarvisSchema } from './schema';
import { log } from './logs';

export const TASK_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'done',
  'failed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface JarvisTask {
  id: string;
  parentId: string | null;
  agent: string;
  kind: string;
  title: string;
  input: Record<string, unknown>;
  status: TaskStatus;
  priority: number;
  dedupeKey: string | null;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  leaseUntil: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  costTokens: number;
  durationMs: number | null;
  createdBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Priority bands. Named so call sites read as intent, not as magic numbers. */
export const PRIORITY = {
  /** Background work: scheduled digests, routine research. */
  ROUTINE: 0,
  /** Something the owner will look at today. */
  NORMAL: 25,
  /** The owner asked for this out loud and is waiting. */
  VOICE: 50,
  /** A customer is waiting on the other end. */
  CUSTOMER: 75,
  /** Something is broken. */
  INCIDENT: 100,
} as const;

export interface EnqueueInput {
  agent: string;
  kind: string;
  title?: string;
  input?: Record<string, unknown>;
  priority?: number;
  /** Suppresses a second live copy of the same work. See schema.ts. */
  dedupeKey?: string | null;
  maxAttempts?: number;
  /** ISO instant, or omit for "as soon as possible". */
  runAfter?: string;
  parentId?: string | null;
  createdBy?: string | null;
}

function toTask(row: Row): JarvisTask {
  return {
    id: row.id,
    parentId: row.parent_id,
    agent: row.agent,
    kind: row.kind,
    title: row.title,
    input: json<Record<string, unknown>>(row.input, {}),
    status: row.status,
    priority: Number(row.priority),
    dedupeKey: row.dedupe_key,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAfter: row.run_after,
    leaseUntil: row.lease_until,
    result: row.result ? json<Record<string, unknown>>(row.result, {}) : null,
    error: row.error,
    costTokens: Number(row.cost_tokens ?? 0),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    createdBy: row.created_by,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Enqueue ──────────────────────────────────────────────────────────────────

export interface EnqueueResult {
  task: JarvisTask;
  /** False when an identical live task already existed and was returned instead. */
  created: boolean;
}

export function enqueue(input: EnqueueInput): EnqueueResult {
  ensureJarvisSchema();
  const db = getDb();
  const now = nowIso();
  const id = crypto.randomUUID();

  try {
    db.prepare(
      `INSERT INTO jarvis_tasks
         (id, parent_id, agent, kind, title, input, status, priority, dedupe_key,
          attempts, max_attempts, run_after, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, 0, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.parentId ?? null,
      input.agent,
      input.kind,
      (input.title || input.kind).slice(0, 200),
      JSON.stringify(input.input ?? {}),
      input.priority ?? PRIORITY.ROUTINE,
      input.dedupeKey ?? null,
      input.maxAttempts ?? 3,
      input.runAfter ?? now,
      input.createdBy ?? null,
      now,
      now
    );
  } catch (e) {
    // The partial unique index fired: identical work is already queued or in
    // flight. This is the expected, healthy path when a schedule overlaps a
    // manual request — not an error worth surfacing.
    const existing = input.dedupeKey ? findLiveByDedupeKey(input.dedupeKey) : null;
    if (existing) {
      log({
        taskId: existing.id,
        agent: input.agent,
        level: 'debug',
        message: 'Duplicate suppressed',
        meta: { dedupeKey: input.dedupeKey, kind: input.kind },
      });
      return { task: existing, created: false };
    }
    throw e;
  }

  const task = getTask(id)!;
  log({
    taskId: id,
    agent: input.agent,
    level: 'info',
    message: `Queued: ${task.title}`,
    meta: { kind: task.kind, priority: task.priority },
  });
  return { task, created: true };
}

function findLiveByDedupeKey(key: string): JarvisTask | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM jarvis_tasks
        WHERE dedupe_key = ? AND status IN ('queued', 'running', 'waiting_approval')
        LIMIT 1`
    )
    .get(key) as Row | undefined;
  return row ? toTask(row) : null;
}

// ── Claim ────────────────────────────────────────────────────────────────────

/** How long a worker may hold a task before it is presumed dead. */
const LEASE_MS = 5 * 60 * 1000;

/**
 * Atomically take the highest-priority runnable task, or null when there is
 * nothing to do.
 *
 * `excludeAgents` lets the caller skip agents that are disabled or already at
 * their concurrency limit without those tasks being lost — they stay queued.
 */
export function claimNext(excludeAgents: string[] = []): JarvisTask | null {
  ensureJarvisSchema();
  const now = nowIso();
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();

  // Built as a literal list rather than bound parameters because the count
  // varies; every value is an agent name from the code's own registry, and the
  // quoting below is exact. No user input reaches this string.
  const exclusion = excludeAgents.length
    ? `AND agent NOT IN (${excludeAgents.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')})`
    : '';

  const row = getDb()
    .prepare(
      `UPDATE jarvis_tasks
          SET status      = 'running',
              attempts    = attempts + 1,
              started_at  = COALESCE(started_at, ?),
              lease_until = ?,
              updated_at  = ?
        WHERE id = (
          SELECT id FROM jarvis_tasks
           WHERE status = 'queued' AND run_after <= ? ${exclusion}
           ORDER BY priority DESC, run_after ASC
           LIMIT 1
        )
        RETURNING *`
    )
    .get(now, leaseUntil, now, now) as Row | undefined;

  return row ? toTask(row) : null;
}

/** Extend the lease on a long-running task so the reaper leaves it alone. */
export function heartbeat(id: string): void {
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  getDb()
    .prepare(`UPDATE jarvis_tasks SET lease_until = ?, updated_at = ? WHERE id = ? AND status = 'running'`)
    .run(leaseUntil, nowIso(), id);
}

/**
 * Return tasks whose worker died to the queue. Called at the top of every
 * orchestrator tick — the recovery path costs one indexed UPDATE and its
 * absence costs silently-dropped work.
 */
export function reclaimStalled(): number {
  ensureJarvisSchema();
  const now = nowIso();
  const result = getDb()
    .prepare(
      `UPDATE jarvis_tasks
          SET status = 'queued', lease_until = NULL, updated_at = ?,
              error = 'Worker stopped responding; task was returned to the queue.'
        WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until < ?`
    )
    .run(now, now);

  const n = Number(result.changes ?? 0);
  if (n > 0) log({ agent: 'orchestrator', level: 'warn', message: `Reclaimed ${n} stalled task(s)` });
  return n;
}

// ── Completion ───────────────────────────────────────────────────────────────

export function complete(
  id: string,
  result: Record<string, unknown>,
  opts: { tokens?: number } = {}
): void {
  const task = getTask(id);
  const duration = task?.startedAt ? Date.now() - Date.parse(task.startedAt) : null;

  getDb()
    .prepare(
      `UPDATE jarvis_tasks
          SET status = 'done', result = ?, error = NULL, lease_until = NULL,
              cost_tokens = cost_tokens + ?, duration_ms = ?,
              finished_at = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(JSON.stringify(result), opts.tokens ?? 0, duration, nowIso(), nowIso(), id);

  log({ taskId: id, agent: task?.agent ?? '', level: 'info', message: 'Completed' });
}

/** Exponential backoff with a ceiling: 1m, 4m, 9m … capped at 30m. */
function backoffMs(attempt: number): number {
  return Math.min(attempt * attempt * 60_000, 30 * 60_000);
}

/**
 * Record a failure. Re-queues with backoff while attempts remain, otherwise
 * marks the task failed — at which point the supervisor picks it up.
 */
export function fail(id: string, error: string, opts: { tokens?: number } = {}): JarvisTask | null {
  const task = getTask(id);
  if (!task) return null;

  const exhausted = task.attempts >= task.maxAttempts;
  const now = nowIso();

  if (exhausted) {
    const duration = task.startedAt ? Date.now() - Date.parse(task.startedAt) : null;
    getDb()
      .prepare(
        `UPDATE jarvis_tasks
            SET status = 'failed', error = ?, lease_until = NULL,
                cost_tokens = cost_tokens + ?, duration_ms = ?,
                finished_at = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(error.slice(0, 1000), opts.tokens ?? 0, duration, now, now, id);
    log({
      taskId: id,
      agent: task.agent,
      level: 'error',
      message: `Failed after ${task.attempts} attempt(s): ${error}`,
    });
  } else {
    const retryAt = new Date(Date.now() + backoffMs(task.attempts)).toISOString();
    getDb()
      .prepare(
        `UPDATE jarvis_tasks
            SET status = 'queued', error = ?, run_after = ?, lease_until = NULL,
                cost_tokens = cost_tokens + ?, updated_at = ?
          WHERE id = ?`
      )
      .run(error.slice(0, 1000), retryAt, opts.tokens ?? 0, now, id);
    log({
      taskId: id,
      agent: task.agent,
      level: 'warn',
      message: `Attempt ${task.attempts} failed, retrying`,
      meta: { retryAt, error: error.slice(0, 200) },
    });
  }

  return getTask(id);
}

/**
 * Park a task while a human decides. The approval row holds the payload; this
 * only records that the task is not runnable and not finished.
 */
export function waitForApproval(id: string, approvalId: string): void {
  getDb()
    .prepare(
      `UPDATE jarvis_tasks
          SET status = 'waiting_approval', lease_until = NULL,
              result = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(JSON.stringify({ approvalId }), nowIso(), id);
  log({ taskId: id, level: 'info', message: 'Waiting for owner approval', meta: { approvalId } });
}

/** Put an approved task back in the queue, ahead of routine work. */
export function resume(id: string, input: Record<string, unknown> = {}): void {
  const task = getTask(id);
  if (!task) return;
  getDb()
    .prepare(
      `UPDATE jarvis_tasks
          SET status = 'queued', run_after = ?, updated_at = ?, input = ?
        WHERE id = ? AND status = 'waiting_approval'`
    )
    .run(nowIso(), nowIso(), JSON.stringify({ ...task.input, ...input }), id);
}

export function cancel(id: string, reason = 'Cancelled by owner'): void {
  getDb()
    .prepare(
      `UPDATE jarvis_tasks
          SET status = 'cancelled', error = ?, lease_until = NULL,
              finished_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('queued', 'running', 'waiting_approval')`
    )
    .run(reason, nowIso(), nowIso(), id);
  log({ taskId: id, level: 'info', message: reason });
}

/**
 * Owner-facing retry of a task that exhausted its attempts. Resets the counter
 * so the supervisor's "safe and reversible" retry cannot loop forever on its
 * own — only a human, or an explicit supervisor decision, gets here.
 */
export function requeue(id: string): void {
  getDb()
    .prepare(
      `UPDATE jarvis_tasks
          SET status = 'queued', attempts = 0, error = NULL, run_after = ?,
              finished_at = NULL, lease_until = NULL, updated_at = ?
        WHERE id = ? AND status IN ('failed', 'cancelled')`
    )
    .run(nowIso(), nowIso(), id);
  log({ taskId: id, level: 'info', message: 'Re-queued' });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function getTask(id: string): JarvisTask | null {
  ensureJarvisSchema();
  const row = getDb().prepare(`SELECT * FROM jarvis_tasks WHERE id = ?`).get(id) as Row | undefined;
  return row ? toTask(row) : null;
}

export function listTasks(
  opts: { status?: TaskStatus | TaskStatus[]; agent?: string; since?: string; limit?: number } = {}
): JarvisTask[] {
  ensureJarvisSchema();
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    where.push(`status IN (${statuses.map(() => '?').join(',')})`);
    values.push(...statuses);
  }
  if (opts.agent) {
    where.push('agent = ?');
    values.push(opts.agent);
  }
  if (opts.since) {
    where.push('created_at >= ?');
    values.push(opts.since);
  }
  values.push(Math.min(opts.limit ?? 100, 500));

  const rows = getDb()
    .prepare(
      `SELECT * FROM jarvis_tasks${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  return rows.map(toTask);
}

export function subtasks(parentId: string): JarvisTask[] {
  ensureJarvisSchema();
  const rows = getDb()
    .prepare(`SELECT * FROM jarvis_tasks WHERE parent_id = ? ORDER BY created_at`)
    .all(parentId) as Row[];
  return rows.map(toTask);
}

export interface QueueDepth {
  queued: number;
  running: number;
  waitingApproval: number;
  failed: number;
  doneToday: number;
}

export function queueDepth(): QueueDepth {
  ensureJarvisSchema();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const row = getDb()
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'queued'           THEN 1 ELSE 0 END) AS queued,
         SUM(CASE WHEN status = 'running'          THEN 1 ELSE 0 END) AS running,
         SUM(CASE WHEN status = 'waiting_approval' THEN 1 ELSE 0 END) AS waiting,
         SUM(CASE WHEN status = 'failed'           THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'done' AND finished_at >= ? THEN 1 ELSE 0 END) AS done_today
       FROM jarvis_tasks`
    )
    .get(midnight.toISOString()) as Row;

  return {
    queued: Number(row.queued ?? 0),
    running: Number(row.running ?? 0),
    waitingApproval: Number(row.waiting ?? 0),
    failed: Number(row.failed ?? 0),
    doneToday: Number(row.done_today ?? 0),
  };
}

/** How many of an agent's tasks are in flight — backs per-agent concurrency. */
export function runningByAgent(): Record<string, number> {
  ensureJarvisSchema();
  const rows = getDb()
    .prepare(`SELECT agent, COUNT(*) AS n FROM jarvis_tasks WHERE status = 'running' GROUP BY agent`)
    .all() as Row[];
  return Object.fromEntries(rows.map((r) => [r.agent, Number(r.n)]));
}

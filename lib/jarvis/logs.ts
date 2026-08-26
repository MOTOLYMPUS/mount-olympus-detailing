// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — activity log and performance metrics.
//
// Same discipline as lib/repo/audit.ts: append-only, and a write that fails
// must never take down the work it was describing. An agent whose logging
// throws would fail a task that actually succeeded, which is worse than a
// missing log line.
//
// Two consumers, one table:
//   • the dashboard, which tails recent lines per agent or per task;
//   • the supervisor, which counts errors to decide what is broken.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { ensureJarvisSchema } from './schema';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface JarvisEvent {
  id: string;
  taskId: string | null;
  agent: string;
  level: LogLevel;
  message: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface LogInput {
  taskId?: string | null;
  agent?: string;
  level?: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Values that would be damaging in a log the dashboard renders. Agents pass
 * tool arguments straight into meta, and a connector argument could carry a
 * key, so this is a real defence rather than a formality.
 */
const SENSITIVE = /pass|secret|token|api_?key|authorization|card|cvv|ssn|signature/i;

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SENSITIVE.test(k) ? '[redacted]' : v;
  }
  return out;
}

export function log(input: LogInput): void {
  try {
    ensureJarvisSchema();
    getDb()
      .prepare(
        `INSERT INTO jarvis_events (id, task_id, agent, level, message, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        input.taskId ?? null,
        input.agent ?? '',
        input.level ?? 'info',
        input.message.slice(0, 2000),
        JSON.stringify(redact(input.meta ?? {})),
        nowIso()
      );
  } catch (e) {
    // Mirrors audit(): loud on the server, invisible to the caller.
    console.error('[jarvis] log write failed', input.message, e);
  }
}

export const logInfo = (agent: string, message: string, meta?: Record<string, unknown>) =>
  log({ agent, level: 'info', message, meta });
export const logWarn = (agent: string, message: string, meta?: Record<string, unknown>) =>
  log({ agent, level: 'warn', message, meta });
export const logError = (agent: string, message: string, meta?: Record<string, unknown>) =>
  log({ agent, level: 'error', message, meta });

function toEvent(row: Row): JarvisEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    agent: row.agent,
    level: row.level,
    message: row.message,
    meta: json<Record<string, unknown>>(row.meta, {}),
    createdAt: row.created_at,
  };
}

export function listEvents(
  opts: { taskId?: string; agent?: string; level?: LogLevel; since?: string; limit?: number } = {}
): JarvisEvent[] {
  ensureJarvisSchema();
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts.taskId) {
    where.push('task_id = ?');
    values.push(opts.taskId);
  }
  if (opts.agent) {
    where.push('agent = ?');
    values.push(opts.agent);
  }
  if (opts.level) {
    where.push('level = ?');
    values.push(opts.level);
  }
  if (opts.since) {
    where.push('created_at >= ?');
    values.push(opts.since);
  }
  values.push(Math.min(opts.limit ?? 200, 1000));

  const rows = getDb()
    .prepare(
      `SELECT * FROM jarvis_events${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  return rows.map(toEvent);
}

// ── Agent health ─────────────────────────────────────────────────────────────

export interface AgentState {
  agent: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  runsTotal: number;
  failuresTotal: number;
  tokensTotal: number;
  updatedAt: string;
}

/**
 * Called once per agent run. Written as a single UPSERT so two concurrent
 * workers finishing at the same moment cannot lose one another's counters the
 * way a read-modify-write would.
 */
export function recordAgentRun(
  agent: string,
  outcome: { ok: boolean; error?: string | null; tokens?: number }
): void {
  try {
    ensureJarvisSchema();
    const now = nowIso();
    getDb()
      .prepare(
        `INSERT INTO jarvis_agent_state
           (agent, enabled, last_run_at, last_success_at, last_error,
            consecutive_failures, runs_total, failures_total, tokens_total, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(agent) DO UPDATE SET
           last_run_at          = excluded.last_run_at,
           last_success_at      = COALESCE(excluded.last_success_at, jarvis_agent_state.last_success_at),
           last_error           = excluded.last_error,
           consecutive_failures = CASE WHEN ? = 1 THEN 0
                                       ELSE jarvis_agent_state.consecutive_failures + 1 END,
           runs_total           = jarvis_agent_state.runs_total + 1,
           failures_total       = jarvis_agent_state.failures_total + ?,
           tokens_total         = jarvis_agent_state.tokens_total + ?,
           updated_at           = excluded.updated_at`
      )
      .run(
        agent,
        now,
        outcome.ok ? now : null,
        outcome.ok ? null : (outcome.error ?? 'unknown error').slice(0, 500),
        outcome.ok ? 0 : 1,
        outcome.ok ? 0 : 1,
        outcome.tokens ?? 0,
        now,
        outcome.ok ? 1 : 0,
        outcome.ok ? 0 : 1,
        outcome.tokens ?? 0
      );
  } catch (e) {
    console.error('[jarvis] agent state write failed', agent, e);
  }
}

function toState(row: Row): AgentState {
  return {
    agent: row.agent,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    consecutiveFailures: Number(row.consecutive_failures),
    runsTotal: Number(row.runs_total),
    failuresTotal: Number(row.failures_total),
    tokensTotal: Number(row.tokens_total),
    updatedAt: row.updated_at,
  };
}

export function agentStates(): AgentState[] {
  ensureJarvisSchema();
  const rows = getDb().prepare(`SELECT * FROM jarvis_agent_state ORDER BY agent`).all() as Row[];
  return rows.map(toState);
}

export function getAgentState(agent: string): AgentState | null {
  ensureJarvisSchema();
  const row = getDb().prepare(`SELECT * FROM jarvis_agent_state WHERE agent = ?`).get(agent) as
    | Row
    | undefined;
  return row ? toState(row) : null;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export interface AgentMetrics {
  agent: string;
  completed: number;
  failed: number;
  avgDurationMs: number;
  tokens: number;
}

/** Per-agent throughput over a window. Backs the dashboard's activity panel. */
export function agentMetrics(sinceIso: string): AgentMetrics[] {
  ensureJarvisSchema();
  const rows = getDb()
    .prepare(
      `SELECT agent,
              SUM(CASE WHEN status = 'done'   THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              AVG(duration_ms)                                   AS avg_ms,
              SUM(cost_tokens)                                   AS tokens
         FROM jarvis_tasks
        WHERE created_at >= ?
        GROUP BY agent
        ORDER BY agent`
    )
    .all(sinceIso) as Row[];

  return rows.map((r) => ({
    agent: r.agent,
    completed: Number(r.completed ?? 0),
    failed: Number(r.failed ?? 0),
    avgDurationMs: Math.round(Number(r.avg_ms ?? 0)),
    tokens: Number(r.tokens ?? 0),
  }));
}

/** Rolling-day token spend, compared against policy.dailyTokenBudget. */
export function tokensSpentSince(sinceIso: string): number {
  ensureJarvisSchema();
  const row = getDb()
    .prepare(`SELECT COALESCE(SUM(cost_tokens), 0) AS n FROM jarvis_tasks WHERE created_at >= ?`)
    .get(sinceIso) as { n: number };
  return Number(row.n);
}

/**
 * Retention. The event log is the fastest-growing table in the database and
 * nothing reads a debug line from six weeks ago; the supervisor calls this on
 * its daily pass.
 */
export function pruneEvents(olderThanIso: string): number {
  ensureJarvisSchema();
  const result = getDb()
    .prepare(`DELETE FROM jarvis_events WHERE created_at < ? AND level IN ('debug', 'info')`)
    .run(olderThanIso);
  return Number(result.changes ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — the orchestrator.
//
// One function, `tick()`, called on a schedule (or by the dashboard). Everything
// the spec asks an orchestrator to do happens inside it:
//
//   assign work          → claimNext(), highest priority first
//   monitor progress     → leases and heartbeats, reclaimStalled()
//   prevent duplicates   → dedupe keys, enforced by a unique index
//   prioritise           → PRIORITY bands, claimed in order
//   retry failures       → queue.fail() with exponential backoff
//   maintain logs        → every transition writes a jarvis_events row
//   summarise results    → the supervisor's scheduled summaries
//
// DESIGN CHOICE: this is a TICK, not a daemon. A long-lived worker loop inside a
// Next.js process is a poor fit — the process is restarted on deploy, may be
// replicated, and has no supervision. A tick that claims a bounded batch, runs
// it, and returns is idempotent, crash-safe, and works identically whether it is
// triggered by Task Scheduler, a cron ping, or a button in the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { getPolicy } from './config';
import { agentEnabled, disabledAgents } from './config';
import {
  JarvisTask,
  PRIORITY,
  claimNext,
  enqueue,
  queueDepth,
  reclaimStalled,
  runningByAgent,
} from './queue';
import { runTask } from './runtime';
import { log, tokensSpentSince } from './logs';
import { expireStale, pendingCount } from './approvals';
import { allAgents } from './registry';
import { ensureAgentsRegistered } from './agents';
import { notifyApprovalsWaiting, notifyAgentFailure } from './notify';
import { getAgentState } from './logs';
import { seedStarterMemory } from './memory';

export interface TickResult {
  claimed: number;
  completed: number;
  failed: number;
  scheduled: number;
  reclaimed: number;
  expired: number;
  tokens: number;
  /** Set when the tick stopped early — budget exhausted, nothing to do, etc. */
  note?: string;
}

/**
 * Wall-clock ceiling for one tick. Sized to stay inside a serverless function
 * timeout and to keep a manual "run now" from appearing to hang. Unfinished work
 * stays queued and the next tick picks it up.
 */
const TICK_BUDGET_MS = 4 * 60 * 1000;

let ticking = false;

export async function tick(opts: { maxTasks?: number } = {}): Promise<TickResult> {
  ensureAgentsRegistered();

  const result: TickResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    scheduled: 0,
    reclaimed: 0,
    expired: 0,
    tokens: 0,
  };

  // In-process guard against overlapping ticks. Not a distributed lock — the
  // real protection is that claimNext() is atomic, so a second process can only
  // ever take *different* tasks. This just avoids wasted work in the common
  // single-process case.
  if (ticking) return { ...result, note: 'A tick is already running.' };
  ticking = true;

  const deadline = Date.now() + TICK_BUDGET_MS;

  try {
    seedStarterMemory();

    // ── Housekeeping ─────────────────────────────────────────────────────────
    result.reclaimed = reclaimStalled();
    result.expired = expireStale();
    result.scheduled = scheduleRecurring();

    // ── Budget ───────────────────────────────────────────────────────────────
    const policy = getPolicy();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const spent = tokensSpentSince(dayAgo);

    if (policy.dailyTokenBudget > 0 && spent >= policy.dailyTokenBudget) {
      // Stopping is the correct response: the alternative is an agent loop
      // spending money all night on work nobody asked for today.
      log({
        agent: 'orchestrator',
        level: 'warn',
        message: `Daily token budget reached (${spent.toLocaleString()}/${policy.dailyTokenBudget.toLocaleString()}). Pausing agent work.`,
      });
      return { ...result, note: 'Daily token budget reached. Work stays queued.' };
    }

    // ── Run ──────────────────────────────────────────────────────────────────
    const maxTasks = opts.maxTasks ?? policy.maxConcurrentTasks;

    for (let i = 0; i < maxTasks; i++) {
      if (Date.now() > deadline) {
        result.note = 'Tick time budget reached; remaining work stays queued.';
        break;
      }

      const busy = runningByAgent();
      const skip = [
        ...disabledAgents(),
        // One task per agent at a time. Two Content Agent runs at once would
        // write two drafts of the same brief and race each other's memory.
        ...Object.entries(busy)
          .filter(([, n]) => n >= 1)
          .map(([agent]) => agent),
      ];

      const task = claimNext(skip);
      if (!task) break;

      result.claimed++;
      const outcome = await runTask(task);
      result.tokens += outcome.tokens;

      if (outcome.ok) result.completed++;
      else {
        result.failed++;
        await maybeEscalate(task);
      }
    }

    // ── Nudge ────────────────────────────────────────────────────────────────
    const pending = pendingCount();
    if (pending >= 3) await notifyApprovalsWaiting(pending);

    return result;
  } catch (e) {
    // A throw here would silently stop all agent work until someone noticed.
    log({
      agent: 'orchestrator',
      level: 'error',
      message: 'Tick failed',
      meta: { error: e instanceof Error ? e.message : String(e) },
    });
    return { ...result, note: `Tick failed: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    ticking = false;
  }
}

/**
 * Escalate an agent that is failing repeatedly.
 *
 * Threshold rather than first failure: transient provider errors are normal and
 * the retry backoff usually absorbs them. Three consecutive failures is a
 * pattern, and a pattern is worth a notification.
 */
const FAILURE_ESCALATION_THRESHOLD = 3;

async function maybeEscalate(task: JarvisTask): Promise<void> {
  const state = getAgentState(task.agent);
  if (!state || state.consecutiveFailures < FAILURE_ESCALATION_THRESHOLD) return;

  await notifyAgentFailure(task.agent, state.lastError ?? 'Repeated failures');

  // Hand the diagnosis to the supervisor — unless the supervisor is what is
  // failing, in which case queueing more supervisor work is exactly wrong.
  if (task.agent !== 'supervisor' && agentEnabled('supervisor')) {
    enqueue({
      agent: 'supervisor',
      kind: 'incident',
      title: `Investigate repeated failures: ${task.agent}`,
      input: {
        brief: `The ${task.agent} agent has failed ${state.consecutiveFailures} times in a row. Last error: ${state.lastError ?? 'unknown'}. Task "${task.title}" (${task.id}) was the most recent.`,
      },
      priority: PRIORITY.INCIDENT,
      dedupeKey: `incident:${task.agent}`,
      createdBy: 'orchestrator',
    });
  }
}

// ── Scheduling ───────────────────────────────────────────────────────────────

/**
 * Queue recurring work whose time has come.
 *
 * There is no cron parser and no scheduler state table. Each scheduled item has
 * a dedupe key containing its period — `analytics:weekly_summary:2026-W30` — and
 * the unique index in schema.ts does the rest: enqueue is attempted every tick,
 * and all but the first in a period are silently suppressed. Idempotent by
 * construction, with no clock state to drift, and correct even if the machine
 * was asleep at the scheduled hour (it runs late rather than never).
 */
export function scheduleRecurring(): number {
  ensureAgentsRegistered();
  const now = new Date();
  let queued = 0;

  for (const agent of allAgents()) {
    if (!agent.schedule?.length) continue;
    if (!agentEnabled(agent.name)) continue;

    for (const item of agent.schedule) {
      if (now.getHours() < item.hour) continue;
      if (item.cadence === 'weekly' && item.weekday !== undefined && now.getDay() !== item.weekday) {
        continue;
      }

      const { task, created } = enqueue({
        agent: agent.name,
        kind: item.kind,
        title: item.title,
        input: { scheduled: true },
        priority: PRIORITY.ROUTINE,
        dedupeKey: `${agent.name}:${item.kind}:${periodKey(item.cadence, now)}`,
        createdBy: 'scheduler',
      });

      if (created) {
        queued++;
        log({
          taskId: task.id,
          agent: agent.name,
          level: 'info',
          message: `Scheduled ${item.cadence} task: ${item.title}`,
        });
      }
    }
  }

  return queued;
}

/** `2026-07-22` | `2026-W30` | `2026-07` — the period a scheduled run belongs to. */
function periodKey(cadence: 'daily' | 'weekly' | 'monthly', now: Date): string {
  const year = now.getFullYear();
  if (cadence === 'monthly') return `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (cadence === 'daily') {
    return `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // ISO week. Worth the arithmetic: a naive "day of year / 7" would produce two
  // different keys for one week at a year boundary, running the weekly summary
  // twice in three days.
  const date = new Date(Date.UTC(year, now.getMonth(), now.getDate()));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ── Status, for the dashboard ────────────────────────────────────────────────

export interface OrchestratorStatus {
  queue: ReturnType<typeof queueDepth>;
  pendingApprovals: number;
  tokensToday: number;
  tokenBudget: number;
  agents: { name: string; label: string; purpose: string; enabled: boolean }[];
}

export function orchestratorStatus(): OrchestratorStatus {
  ensureAgentsRegistered();
  const policy = getPolicy();
  return {
    queue: queueDepth(),
    pendingApprovals: pendingCount(),
    tokensToday: tokensSpentSince(new Date(Date.now() - 86_400_000).toISOString()),
    tokenBudget: policy.dailyTokenBudget,
    agents: allAgents().map((a) => ({
      name: a.name,
      label: a.label,
      purpose: a.purpose,
      enabled: agentEnabled(a.name),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — the tools agents can use.
//
// This file is the complete surface between an agent and the business. If a
// capability is not here, no agent has it: there is no shell, no filesystem, no
// `fetch`, and no SQL. Reviewing this one file tells you everything eight agents
// can do.
//
// THE READ/WRITE ASYMMETRY IS THE POINT.
//   Reads  — generous. Revenue, customers, schedule, catalogue, performance.
//            Agents reason better with more context and reading is harmless.
//   Writes — two, and only two: `save_memory` (Jarvis's own notes) and
//            `request_action` (which routes through the approval policy in
//            connectors/index.ts and cannot bypass it).
//
// An agent therefore cannot edit a customer, move an appointment, refund a
// payment, or change a price — not because it is told not to, but because no
// tool exists that would let it.
//
// NO WEB ACCESS. Agents cannot browse. The Lead Generation and SEO agents work
// from the business's own data plus the model's knowledge, and they are told to
// label anything they cannot verify as an assumption. Adding a search tool
// later is a matter of appending one entry to TOOLS — but doing it silently
// would let unverified claims from the open web read exactly like measured
// facts, so it stays out until it can be cited properly.
// ─────────────────────────────────────────────────────────────────────────────

import { allAddOns, allServices, pricingIsPlaceholder } from '@/data/pricing';
import {
  countByStatus,
  listAppointments,
  repeatCustomerStats,
  revenueBetween,
  revenueByCustomer,
  revenueByIndustry,
  revenueByService,
  revenueSeries,
} from '../repo/appointments';
import { employeeStats, satisfaction } from '../repo/jobs';
import { getUser, listUsers } from '../repo/users';
import { listEstimateRequests } from '../db';
import { formatCurrency, formatHours, formatPrice } from '../pricing';
import { fmtDate, fmtDateTime, today } from './time';
import { business } from '../business';
import { sizeLabel } from '../industries';
import { Industry } from '../types';
import { ToolDefinition } from './llm';
import { MemoryKind, isMemoryKind, remember, searchMemory, memoryForEntity } from './memory';
import { connectorStatuses, perform } from './connectors';
import { PRIORITY, enqueue, getTask, listTasks, queueDepth, requeue } from './queue';
import { Risk, pendingCount } from './approvals';
import { agentMetrics, agentStates, log, tokensSpentSince } from './logs';
import { getPolicy } from './config';
import { notifyOwners } from './notify';

/**
 * A ceiling the supervisor cannot reason its way past. Beyond this, a task is
 * not flaky — it is broken — and further retries spend money to relearn that.
 */
const MAX_SUPERVISOR_RETRY_ATTEMPTS = 6;

// ── Context passed to every tool call ────────────────────────────────────────

export interface ToolContext {
  agent: string;
  taskId: string | null;
  /** Agents this agent may delegate to. Empty for most; the supervisor has all. */
  canDelegateTo: string[];
}

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext
) => Promise<string> | string;

interface Tool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

// ── Small helpers ────────────────────────────────────────────────────────────

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v.trim() : fallback;

const int = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/**
 * Resolve a period name to an ISO window. Models are unreliable at date
 * arithmetic and a subtly wrong window produces a confidently wrong revenue
 * figure, so they choose from a fixed vocabulary instead of passing dates.
 */
function resolvePeriod(period: string): { from: string; to: string; label: string } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      break;
    case 'last_7_days':
      start.setDate(start.getDate() - 7);
      break;
    case 'last_90_days':
      start.setDate(start.getDate() - 90);
      break;
    case 'this_month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last_month':
      start.setMonth(start.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(1);
      end.setHours(0, 0, 0, 0);
      break;
    case 'this_year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last_30_days':
    default:
      start.setDate(start.getDate() - 30);
      break;
  }

  return { from: start.toISOString(), to: end.toISOString(), label: period.replace(/_/g, ' ') };
}

const PERIODS = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'last_month',
  'this_year',
];

/** Money is stored in cents everywhere in this app; never hand a model raw cents. */
const money = (cents: number) => formatCurrency(cents);

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOLS: Record<string, Tool> = {
  // ── Memory ─────────────────────────────────────────────────────────────────

  search_memory: {
    definition: {
      name: 'search_memory',
      description:
        "Search Jarvis's business memory: brand voice, SOPs, goals, past campaigns, prior findings, and notes about customers. Always search before making an assumption about how this business works.",
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What you are looking for.' },
          kind: { type: 'string', description: 'Optional filter, e.g. brand, goal, sop, campaign, insight.' },
          limit: { type: 'integer', description: 'Default 8, max 25.' },
        },
        required: ['query'],
      },
    },
    handler: (input) => {
      const results = searchMemory(str(input.query), {
        kind: isMemoryKind(input.kind) ? input.kind : undefined,
        limit: Math.min(int(input.limit, 8), 25),
      });
      if (!results.length) return 'No memories matched. Do not invent one — say what you assumed.';
      return results
        .map(
          (m) =>
            `[${m.kind}] ${m.title}${m.confidence < 0.8 ? ' (unconfirmed)' : ''}\n${m.body || '(no detail)'}`
        )
        .join('\n\n---\n\n');
    },
  },

  save_memory: {
    definition: {
      name: 'save_memory',
      description:
        'Record something worth remembering permanently: a finding, a decision, a campaign result, a fact about the business. Do NOT use this for information already stored as a customer, appointment, job, or payment.',
      input_schema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            description: 'One of: brand, goal, sop, project, preference, campaign, insight, customer_note, employee_note, pricing_note, fact.',
          },
          title: { type: 'string' },
          body: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          confidence: {
            type: 'number',
            description:
              '0-1. Use 1.0 only for something the owner stated. Use 0.5-0.7 for your own inference so it is flagged as unconfirmed.',
          },
        },
        required: ['kind', 'title', 'body'],
      },
    },
    handler: (input, ctx) => {
      const kind = isMemoryKind(input.kind) ? (input.kind as MemoryKind) : 'fact';
      const memory = remember({
        kind,
        title: str(input.title),
        body: str(input.body),
        tags: Array.isArray(input.tags)
          ? input.tags.filter((t): t is string => typeof t === 'string').slice(0, 10)
          : [],
        source: ctx.agent,
        // Agent-written memories default below the confirmation threshold. An
        // agent that claims certainty about its own inference is how a guess
        // becomes "what the business believes" three months later.
        confidence: typeof input.confidence === 'number' ? Math.min(1, Math.max(0, input.confidence)) : 0.7,
      });
      return `Saved memory "${memory.title}" (${memory.kind}).`;
    },
  },

  // ── Business reads ─────────────────────────────────────────────────────────

  business_snapshot: {
    definition: {
      name: 'business_snapshot',
      description:
        'The current state of the business in one call: revenue this month and last, job counts by status, customer totals, repeat rate, satisfaction, and what is on the schedule next. Start here.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: () => {
      const thisMonth = resolvePeriod('this_month');
      const lastMonth = resolvePeriod('last_month');
      const rev = revenueBetween(thisMonth.from, thisMonth.to);
      const prev = revenueBetween(lastMonth.from, lastMonth.to);
      const statuses = countByStatus(resolvePeriod('last_90_days').from, thisMonth.to);
      const repeat = repeatCustomerStats();
      const rating = satisfaction(resolvePeriod('last_90_days').from, thisMonth.to);
      const customers = listUsers({ roles: ['customer'], activeOnly: true, limit: 1000 }).length;
      const upcoming = listAppointments({ direction: 'upcoming', limit: 5 });

      return [
        `Business: ${business.name}. Today is ${fmtDate(today())}.`,
        '',
        `Revenue this month: ${money(rev.revenue)} across ${rev.jobs} completed job(s).`,
        `Revenue last month: ${money(prev.revenue)} across ${prev.jobs} job(s).`,
        `Active customers: ${customers}. Repeat customers: ${repeat.repeat}/${repeat.total}.`,
        rating.average !== null
          ? `Satisfaction (90d): ${rating.average.toFixed(2)}/5 from ${rating.count} rating(s).`
          : 'Satisfaction: no ratings recorded yet.',
        '',
        `Appointments by status (90d): ${
          Object.entries(statuses)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ') || 'none'
        }`,
        '',
        upcoming.length
          ? `Next up:\n${upcoming
              .map(
                (a) =>
                  `  • ${fmtDateTime(a.startsAt)} — ${a.customerName ?? 'customer'} — ${a.serviceIds.join(', ') || 'service'} (${a.status})`
              )
              .join('\n')}`
          : 'Nothing is on the schedule.',
      ].join('\n');
    },
  },

  revenue_report: {
    definition: {
      name: 'revenue_report',
      description:
        'Revenue for a period, broken down by service, industry, and top customers. Figures come from completed appointments.',
      input_schema: {
        type: 'object',
        properties: {
          period: { type: 'string', description: `One of: ${PERIODS.join(', ')}.` },
          breakdown: {
            type: 'string',
            description: 'One of: service, industry, customer, daily. Defaults to service.',
          },
        },
        required: ['period'],
      },
    },
    handler: (input) => {
      const period = resolvePeriod(str(input.period, 'last_30_days'));
      const total = revenueBetween(period.from, period.to);
      const breakdown = str(input.breakdown, 'service');

      const buckets =
        breakdown === 'industry'
          ? revenueByIndustry(period.from, period.to)
          : breakdown === 'customer'
            ? revenueByCustomer(period.from, period.to, 10)
            : breakdown === 'daily'
              ? revenueSeries(period.from, period.to)
              : revenueByService(period.from, period.to);

      if (total.jobs === 0) {
        return `No completed jobs in ${period.label}. Do not extrapolate a trend from zero data — say the period is empty.`;
      }

      const average = Math.round(total.revenue / total.jobs);
      return [
        `Revenue, ${period.label}: ${money(total.revenue)} from ${total.jobs} job(s). Average job value ${money(average)}.`,
        '',
        `By ${breakdown}:`,
        ...buckets
          .slice(0, 15)
          .map((b) => `  • ${b.key}: ${money(b.revenue)} (${b.jobs} job${b.jobs === 1 ? '' : 's'})`),
      ].join('\n');
    },
  },

  list_customers: {
    definition: {
      name: 'list_customers',
      description:
        'List customers, most recent first. Use `search` to find someone by name or email. Returns ids you can pass to other tools.',
      input_schema: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          limit: { type: 'integer', description: 'Default 20, max 100.' },
        },
      },
    },
    handler: (input) => {
      const users = listUsers({
        roles: ['customer'],
        activeOnly: true,
        search: str(input.search) || undefined,
        limit: Math.min(int(input.limit, 20), 100),
      });
      if (!users.length) return 'No customers matched.';
      return users
        .map(
          (u) =>
            `${u.id} — ${u.name} <${u.email}>${u.phone ? ` ${u.phone}` : ''} — SMS consent: ${u.smsConsent ? 'yes' : 'NO'}`
        )
        .join('\n');
    },
  },

  get_customer: {
    definition: {
      name: 'get_customer',
      description:
        'Everything about one customer: contact details, SMS consent, appointment history, spend, and any notes Jarvis has recorded.',
      input_schema: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
      },
    },
    handler: (input) => {
      const user = getUser(str(input.userId));
      if (!user) return `No customer with id ${str(input.userId)}.`;

      const history = listAppointments({ customerId: user.id, direction: 'all', limit: 20 });
      const spend = history
        .filter((a) => a.status === 'completed')
        .reduce((sum, a) => sum + (a.quotedTotal ?? 0), 0);
      const notes = memoryForEntity(user.id, 10);

      return [
        `${user.name} <${user.email}> ${user.phone || '(no phone)'}`,
        `SMS consent: ${user.smsConsent ? 'yes' : 'NO — do not text them'}. Customer since ${fmtDate(user.createdAt)}.`,
        `Lifetime spend (completed jobs): ${money(spend)} across ${history.filter((a) => a.status === 'completed').length} job(s).`,
        '',
        history.length
          ? `History:\n${history
              .slice(0, 10)
              .map((a) => `  • ${fmtDateTime(a.startsAt)} — ${a.serviceIds.join(', ')} — ${a.status} — ${money(a.quotedTotal ?? 0)}`)
              .join('\n')}`
          : 'No appointments yet.',
        notes.length ? `\nNotes:\n${notes.map((n) => `  • ${n.title}: ${n.body}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    },
  },

  list_appointments: {
    definition: {
      name: 'list_appointments',
      description: 'The schedule. Upcoming by default; pass direction "past" for history.',
      input_schema: {
        type: 'object',
        properties: {
          direction: { type: 'string', description: 'upcoming | past | all. Default upcoming.' },
          limit: { type: 'integer', description: 'Default 20, max 100.' },
        },
      },
    },
    handler: (input) => {
      const direction = ['upcoming', 'past', 'all'].includes(str(input.direction))
        ? (str(input.direction) as 'upcoming' | 'past' | 'all')
        : 'upcoming';
      const appts = listAppointments({ direction, limit: Math.min(int(input.limit, 20), 100) });
      if (!appts.length) return `No ${direction} appointments.`;
      return appts
        .map(
          (a) =>
            `${a.id} — ${fmtDateTime(a.startsAt)} — ${a.customerName ?? '?'} — ${a.serviceIds.join(', ')} — ${a.status} — ${money(a.quotedTotal ?? 0)} — ${a.locationType}`
        )
        .join('\n');
    },
  },

  service_catalogue: {
    definition: {
      name: 'service_catalogue',
      description:
        'Every service and add-on with real prices and durations. ALWAYS use this before mentioning a price — never quote one from memory.',
      input_schema: {
        type: 'object',
        properties: { industry: { type: 'string', description: 'Optional: automotive, marine, aviation, motorcycle.' } },
      },
    },
    handler: (input) => {
      const industry = str(input.industry);
      const services = allServices.filter((s) => !industry || s.industry === industry);
      const addOns = allAddOns.filter((a) => !industry || a.industry === industry);

      if (!services.length) return `No services found for "${industry}".`;

      // Prices vary by size class, so each is listed rather than reduced to a
      // single "from" figure — an agent that saw only the cheapest price would
      // quote a compact-car number for a lifted truck.
      const priceLine = (prices: Record<string, { price: number; priceMax?: number }>) => {
        const parts = Object.entries(prices).map(
          ([size, p]) => `${sizeLabel(size as never)} ${formatPrice(p.price, p.priceMax)}`
        );
        return parts.length ? parts.join(' | ') : 'price on request';
      };

      const placeholderWarning = industry && pricingIsPlaceholder[industry as Industry]
        ? `\n⚠️  Pricing for ${industry} is NOT finalised — these are placeholders. Never present them as a firm quote.\n`
        : '';

      return [
        placeholderWarning,
        'SERVICES',
        ...services.map(
          (s) =>
            `  • ${s.name} (id: ${s.id}, ${s.industry}) — ${s.shortDescription}\n` +
            `    ${formatHours(s.estimatedHours)} — ${priceLine(s.prices as never)}`
        ),
        '',
        'ADD-ONS',
        ...addOns.map(
          (a) => `  • ${a.name} (id: ${a.id}) — ${a.description} — ${priceLine(a.prices as never)}`
        ),
      ]
        .filter(Boolean)
        .join('\n');
    },
  },

  employee_performance: {
    definition: {
      name: 'employee_performance',
      description: 'Per-technician jobs completed, revenue, average job value, and customer rating.',
      input_schema: {
        type: 'object',
        properties: { period: { type: 'string', description: `One of: ${PERIODS.join(', ')}.` } },
      },
    },
    handler: (input) => {
      const period = resolvePeriod(str(input.period, 'last_30_days'));
      const stats = employeeStats(period.from, period.to);
      if (!stats.length) return `No completed jobs in ${period.label}.`;
      return stats
        .map(
          (s) =>
            `${s.name}: ${s.jobsCompleted} job(s), ${money(s.revenue)}, avg ${money(s.averageJobValue)}, ` +
            `avg completion ${Math.round(s.averageCompletionMinutes)}min, rating ${
              s.averageRating !== null ? `${s.averageRating.toFixed(2)} (${s.ratingCount})` : 'none'
            }`
        )
        .join('\n');
    },
  },

  recent_leads: {
    definition: {
      name: 'recent_leads',
      description:
        'Estimate requests from the public site — the top of the funnel. Shows which ones were never converted.',
      input_schema: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Default 25, max 100.' } },
      },
    },
    handler: (input) => {
      const leads = listEstimateRequests(Math.min(int(input.limit, 25), 100));
      if (!leads.length) return 'No estimate requests yet.';
      return leads
        .map(
          (l) =>
            `${l.reference} — ${fmtDate(l.createdAt)} — ${l.name} — ${l.industry}/${l.vehicleType} ${l.year} ${l.make} ${l.model} — ` +
            `${l.serviceIds.join(', ')} — ${money(l.quotedTotal ?? 0)} — status: ${l.status}`
        )
        .join('\n');
    },
  },

  // ── System introspection (supervisor only) ─────────────────────────────────

  system_health: {
    definition: {
      name: 'system_health',
      description:
        'The state of Jarvis itself: queue depth, per-agent success and failure counts, pending approvals, token spend, and which integrations are connected.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: () => {
      const depth = queueDepth();
      const states = agentStates();
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const metrics = agentMetrics(dayAgo);
      const policy = getPolicy();
      const spent = tokensSpentSince(dayAgo);

      return [
        `Queue: ${depth.queued} queued, ${depth.running} running, ${depth.waitingApproval} awaiting approval, ${depth.failed} failed, ${depth.doneToday} completed today.`,
        `Approvals pending: ${pendingCount()}.`,
        `Token spend (24h): ${spent.toLocaleString()}${
          policy.dailyTokenBudget ? ` of ${policy.dailyTokenBudget.toLocaleString()} budget` : ''
        }.`,
        '',
        'Agents:',
        ...(states.length
          ? states.map((s) => {
              const m = metrics.find((x) => x.agent === s.agent);
              return (
                `  • ${s.agent}: ${s.enabled ? 'enabled' : 'DISABLED'}, ` +
                `${s.consecutiveFailures} consecutive failure(s), ` +
                `${s.runsTotal} run(s) all time, ` +
                `24h: ${m?.completed ?? 0} done / ${m?.failed ?? 0} failed` +
                (s.lastError ? `\n      last error: ${s.lastError}` : '')
              );
            })
          : ['  (no agent has run yet)']),
        '',
        'Integrations:',
        ...connectorStatuses().map(
          (c) =>
            `  • ${c.label}: ${c.configured ? 'connected' : `NOT connected (missing ${c.missing.join(', ')})`}`
        ),
      ].join('\n');
    },
  },

  failed_tasks: {
    definition: {
      name: 'failed_tasks',
      description:
        'Tasks that exhausted their retries, with the error each one ended on. This is your primary input.',
      input_schema: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Default 20, max 50.' } },
      },
    },
    handler: (input) => {
      const failed = listTasks({ status: 'failed', limit: Math.min(int(input.limit, 20), 50) });
      if (!failed.length) return 'Nothing has failed. Say so plainly rather than inventing concerns.';
      return failed
        .map(
          (t) =>
            `${t.id} — ${t.agent}/${t.kind} — "${t.title}" — ${t.attempts} attempt(s) — failed ${
              t.finishedAt ? fmtDateTime(t.finishedAt) : 'recently'
            }\n    error: ${t.error ?? 'unknown'}`
        )
        .join('\n');
    },
  },

  retry_task: {
    definition: {
      name: 'retry_task',
      description:
        'Re-queue a failed task. ONLY for failures that are plausibly transient — a timeout, a rate limit, a provider outage. Never retry a task that failed because of missing credentials, missing data, or a refusal: it will fail identically and burn the owner\'s money.',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          reason: { type: 'string', description: 'Why you believe this failure was transient.' },
        },
        required: ['taskId', 'reason'],
      },
    },
    handler: (input, ctx) => {
      const taskId = str(input.taskId);
      const task = getTask(taskId);
      if (!task) return `No task with id ${taskId}.`;
      if (task.status !== 'failed') return `Task ${taskId} is "${task.status}", not failed.`;

      // A guard the supervisor cannot talk its way past. Retrying a task that
      // has already been retried into the ground is the classic runaway-cost
      // failure of an autonomous supervisor.
      if (task.attempts >= MAX_SUPERVISOR_RETRY_ATTEMPTS) {
        return `Task ${taskId} has already been attempted ${task.attempts} times. Do not retry it again — report it to the owner instead.`;
      }

      requeue(taskId);
      log({
        taskId,
        agent: ctx.agent,
        level: 'info',
        message: `Supervisor re-queued a failed task: ${str(input.reason)}`,
      });
      return `Re-queued ${taskId} ("${task.title}").`;
    },
  },

  notify_owner: {
    definition: {
      name: 'notify_owner',
      description:
        'Send the owner a notification in the dashboard (and as a push notification if they have enabled it). For things that genuinely need attention — not routine status.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          urgency: { type: 'string', description: 'normal | high. Default normal.' },
        },
        required: ['title', 'body'],
      },
    },
    handler: async (input, ctx) => {
      const sent = await notifyOwners({
        title: str(input.title).slice(0, 120),
        body: str(input.body).slice(0, 500),
        url: '/jarvis',
        urgent: str(input.urgency) === 'high',
        agent: ctx.agent,
      });
      return sent > 0
        ? `Notified ${sent} owner/admin account(s).`
        : 'No owner or admin account was found to notify.';
    },
  },

  // ── The two write paths ────────────────────────────────────────────────────

  request_action: {
    definition: {
      name: 'request_action',
      description:
        'Do something in the real world: send an email or text, write a content draft, post to social, note a customer. ' +
        'Most channels require the owner to approve first — you will be told which. ' +
        'Write the FINAL content here, not a description of it: what you pass is exactly what will be sent. ' +
        'If this returns "awaiting approval", your job on that item is DONE — do not try another route.',
      input_schema: {
        type: 'object',
        properties: {
          connector: {
            type: 'string',
            description: 'email | sms | crm | calendar | website | social | accounting',
          },
          action: {
            type: 'string',
            description:
              'email: send, campaign · sms: send, campaign · crm: noteCustomer · calendar: proposeChange, syncOut · website: writeDraft, proposeSeoChange · social: post, postGoogleBusiness',
          },
          summary: {
            type: 'string',
            description: 'One line the owner reads in the approval queue. Be specific.',
          },
          payload: {
            type: 'object',
            description:
              'The exact arguments. email.send: {to, subject, body} · sms.send: {userId, body} · website.writeDraft: {kind, title, body} · crm.noteCustomer: {userId, title, note} · calendar.proposeChange: {appointmentId, proposal} · social.post: {platform, body}',
          },
          risk: { type: 'string', description: 'low | medium | high. Default medium.' },
        },
        required: ['connector', 'action', 'summary', 'payload'],
      },
    },
    handler: async (input, ctx) => {
      const payload =
        input.payload && typeof input.payload === 'object'
          ? (input.payload as Record<string, unknown>)
          : {};

      const outcome = await perform({
        connector: str(input.connector),
        action: str(input.action),
        payload: { ...payload, agent: ctx.agent },
        summary: str(input.summary) || `${str(input.connector)}.${str(input.action)}`,
        agent: ctx.agent,
        taskId: ctx.taskId,
        risk: (['low', 'medium', 'high'] as Risk[]).includes(str(input.risk) as Risk)
          ? (str(input.risk) as Risk)
          : undefined,
      });

      switch (outcome.status) {
        case 'done':
          return `Done: ${outcome.detail}`;
        case 'awaiting_approval':
          return `Queued for approval (id ${outcome.approvalId}). ${outcome.detail}`;
        case 'refused':
          return `Not allowed: ${outcome.detail}`;
      }
    },
  },

  delegate_task: {
    definition: {
      name: 'delegate_task',
      description:
        'Hand work to another agent by queueing a task. Use when the work is genuinely outside your remit — do not delegate what you can do yourself.',
      input_schema: {
        type: 'object',
        properties: {
          agent: { type: 'string' },
          kind: { type: 'string', description: 'Short machine-ish name, e.g. draft_post.' },
          title: { type: 'string' },
          brief: { type: 'string', description: 'Everything the other agent needs to know.' },
        },
        required: ['agent', 'kind', 'title', 'brief'],
      },
    },
    handler: (input, ctx) => {
      const target = str(input.agent);
      if (!ctx.canDelegateTo.includes(target)) {
        return `You cannot delegate to "${target}". You may delegate to: ${
          ctx.canDelegateTo.join(', ') || '(nobody)'
        }.`;
      }

      const { task, created } = enqueue({
        agent: target,
        kind: str(input.kind, 'task'),
        title: str(input.title),
        input: { brief: str(input.brief), from: ctx.agent },
        priority: PRIORITY.NORMAL,
        parentId: ctx.taskId,
        createdBy: ctx.agent,
        // Suppresses the same handoff being queued twice inside one run.
        dedupeKey: `${target}:${str(input.kind)}:${str(input.title).toLowerCase().slice(0, 60)}`,
      });

      return created
        ? `Queued for ${target}: "${task.title}" (task ${task.id}).`
        : `${target} already has that queued — not duplicating it.`;
    },
  },
};

// ── Public surface ───────────────────────────────────────────────────────────

/** Tool definitions for a named subset, in the order given. */
export function toolDefinitions(names: string[]): ToolDefinition[] {
  return names.map((n) => TOOLS[n]?.definition).filter((d): d is ToolDefinition => !!d);
}

export function allToolNames(): string[] {
  return Object.keys(TOOLS);
}

/**
 * Build the executor for one agent run.
 *
 * `allowed` is enforced here rather than trusted from the tool definitions sent
 * to the model: a model can hallucinate a tool name it was never given, and the
 * Marketing Agent calling a tool only the Supervisor should have would be a
 * privilege escalation with a very quiet failure mode.
 */
export function makeExecutor(allowed: string[], ctx: ToolContext) {
  const permitted = new Set(allowed);
  return async (name: string, input: Record<string, unknown>): Promise<string> => {
    if (!permitted.has(name)) {
      return `You do not have access to the tool "${name}". Available: ${allowed.join(', ')}.`;
    }
    const tool = TOOLS[name];
    if (!tool) return `No such tool: "${name}".`;
    return tool.handler(input, ctx);
  };
}

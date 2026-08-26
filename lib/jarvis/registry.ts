// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — the agent registry.
//
// An agent is DATA, not a class: a name, a set of tool names, some instructions,
// and the task kinds it understands. Everything that actually executes lives in
// runtime.ts and is shared. That is the whole scalability story — adding a ninth
// agent means adding one file and one line in agents/index.ts, and nothing in
// the orchestrator, the queue, the dashboard, or the voice router changes.
//
// The shared preamble below is written once here rather than copied into eight
// prompts. When a safety rule changes — and they do — it changes in one place,
// and it is impossible for one agent to be quietly running last month's rules.
// ─────────────────────────────────────────────────────────────────────────────

import { business } from '../business';
import { fmtDate, today } from './time';
import { Channel, channelMode } from './config';
import { Memory, pinnedMemory, renderMemories } from './memory';

export type Cadence = 'daily' | 'weekly' | 'monthly';

export interface ScheduledWork {
  kind: string;
  cadence: Cadence;
  /** Local hour (0-23) at which the scheduler should queue it. */
  hour: number;
  /** 0 = Sunday. Weekly only. */
  weekday?: number;
  title: string;
}

export interface TaskKind {
  /** Title used when the task is queued without one. */
  title: string;
  /**
   * Turn the task's input into the opening user turn. Kept as a function so a
   * task kind can shape its own brief instead of every agent parsing a blob.
   */
  brief: (input: Record<string, unknown>) => string;
}

export interface AgentDefinition {
  name: string;
  label: string;
  /** One line, shown on the dashboard. */
  purpose: string;
  /** Tool names from lib/jarvis/tools.ts. Enforced at execution, not by trust. */
  tools: string[];
  /** Agents this one may hand work to. Empty for most. */
  delegatesTo?: string[];
  /** Role-specific instructions, appended to the shared preamble. */
  instructions: string;
  tasks: Record<string, TaskKind>;
  /** Recurring work the scheduler queues automatically. */
  schedule?: ScheduledWork[];
  /** Tool round trips. Research agents need more; writers need fewer. */
  maxSteps?: number;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const REGISTRY = new Map<string, AgentDefinition>();

export function registerAgent(definition: AgentDefinition): void {
  if (REGISTRY.has(definition.name)) {
    // A duplicate name would silently shadow an agent and its scheduled work
    // would run against the wrong instructions.
    throw new Error(`Duplicate Jarvis agent name: "${definition.name}"`);
  }
  REGISTRY.set(definition.name, definition);
}

export function getAgent(name: string): AgentDefinition | null {
  return REGISTRY.get(name) ?? null;
}

export function allAgents(): AgentDefinition[] {
  return [...REGISTRY.values()];
}

export function agentNames(): string[] {
  return [...REGISTRY.keys()];
}

// ── The shared preamble ──────────────────────────────────────────────────────

/**
 * What the current approval policy means, rendered in plain language.
 *
 * Generated from the live policy rather than hardcoded, so an agent is never
 * told it must seek approval for something the owner has since automated — or,
 * far worse, told it may send something that now requires approval.
 */
function policyBriefing(): string {
  const describe = (channel: Channel, label: string): string => {
    const mode = channelMode(channel);
    if (mode === 'auto') return `  • ${label}: goes out immediately.`;
    if (mode === 'off') return `  • ${label}: TURNED OFF. Do not attempt it.`;
    return `  • ${label}: drafted, then queued for the owner to approve.`;
  };

  return [
    describe('email.customer', 'Emails to a customer'),
    describe('sms.customer', 'Texts to a customer'),
    describe('email.marketing', 'Email campaigns'),
    describe('sms.marketing', 'SMS campaigns'),
    describe('social.post', 'Social posts'),
    describe('website.content', 'Website content'),
    describe('website.technical', 'Technical SEO changes'),
    describe('crm.write', 'Internal notes'),
  ].join('\n');
}

function preamble(memories: Memory[]): string {
  return `You are one specialist agent inside Jarvis, the operating system for ${business.name}.

Today is ${fmtDate(today())}.

## The business
- ${business.name} — detailing for automotive, marine, aviation, and motorcycle customers.
- Phone: ${business.phone} · Email: ${business.email}
- Service area: ${business.serviceArea}

## What you must remember
${memories.length ? renderMemories(memories) : '(No standing instructions have been recorded yet.)'}

## How you work
You are given ONE task. Do it, then write a short report. You are not having a
conversation — nobody reads your intermediate thinking, only your final summary.

Use your tools to find things out. Do not guess at a number you could look up.
Prices come from \`service_catalogue\` and revenue from \`revenue_report\` — a
figure you recalled from memory instead of reading is how this business ends up
honouring a price it never set.

## Truthfulness — this matters more than being useful
- You have NO web access. You cannot check a competitor's site, look up a search
  volume, or read the news. When you reason from general knowledge rather than
  from this business's data, say so explicitly: "assumption:" or "unverified:".
- Never present an estimate as a measurement. If you did not read it with a
  tool, it is not a fact.
- If the data is too thin to support a conclusion, say that instead of producing
  a confident one. "Only four completed jobs this month, too few to call a
  trend" is a useful answer. An invented trend is not.

## What you may and may not do
You cannot edit customers, move appointments, change prices, or move money — no
tool exists for it, by design. Everything that reaches the outside world goes
through \`request_action\`, which applies the owner's current policy:

${policyBriefing()}

When \`request_action\` says something is queued for approval, that item is
FINISHED for you. Do not look for another way to send it, and do not queue it a
second time.

## Your report
End with a summary the owner can read in fifteen seconds:
- What you did.
- What you found, with the numbers you actually read.
- What you are asking them to approve, if anything.
- What you could not do, and what is missing.
Plain sentences. No preamble, no "I hope this helps", no emoji.`;
}

/**
 * Assemble the full system prompt for one run. Pinned memory is read at build
 * time so an owner correcting the brand voice at 10am changes the 10:05 run.
 */
export function buildAgentSystemPrompt(agent: AgentDefinition): string {
  return `${preamble(pinnedMemory())}

## Your role: ${agent.label}
${agent.instructions}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — configuration and approval policy.
//
// Everything here is stored in the existing `settings` table (lib/repo/settings)
// rather than in .env, because the owner must be able to change autonomy from
// the dashboard — or by voice — without a redeploy. Env vars configure
// *credentials*; settings configure *behaviour*.
//
// THE POLICY IS DENY-BY-DEFAULT. `DEFAULT_POLICY` below requires human approval
// for every channel that reaches a customer or the public. Loosening it is an
// explicit act, recorded in the audit log. A misconfigured policy that fails
// open would mean a draft reaching a real customer, so the resolver treats
// anything it does not recognise as "needs approval".
// ─────────────────────────────────────────────────────────────────────────────

import { getSetting, setSetting } from '../repo/settings';

// ── Channels ─────────────────────────────────────────────────────────────────

/**
 * A channel is a way for Jarvis to affect the world outside its own database.
 * Reading data and writing memory are not channels — those are always allowed.
 */
export const CHANNELS = [
  'email.customer', // a one-off reply or follow-up to a named customer
  'sms.customer',
  'email.marketing', // a campaign to many recipients
  'sms.marketing',
  'social.post', // Facebook / Instagram / Google Business Profile
  'website.content', // blog posts, landing copy, service descriptions
  'website.technical', // metadata, redirects, internal links — SEO agent
  'calendar.write', // creating or moving real appointments
  'crm.write',
  'accounting.write',
  'payment.write', // refunds, charges — never auto-approved, see below
] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  'email.customer': 'Customer emails',
  'sms.customer': 'Customer texts',
  'email.marketing': 'Email campaigns',
  'sms.marketing': 'SMS campaigns',
  'social.post': 'Social media posts',
  'website.content': 'Website content',
  'website.technical': 'Website technical / SEO changes',
  'calendar.write': 'Calendar changes',
  'crm.write': 'CRM updates',
  'accounting.write': 'Accounting entries',
  'payment.write': 'Payments and refunds',
};

/**
 * Channels that may NEVER be set to automatic, regardless of what is written to
 * the settings row. Money moving without a human is not a preference this
 * system offers; a corrupted or hand-edited settings value must not be able to
 * grant it either.
 */
const ALWAYS_APPROVE: Channel[] = ['payment.write'];

// ── Policy shape ─────────────────────────────────────────────────────────────

/**
 * `auto`     — the connector runs as soon as the agent asks.
 * `approve`  — an approval row is created and the task pauses.
 * `off`      — the agent is told the channel is unavailable and must not retry.
 */
export type ChannelMode = 'auto' | 'approve' | 'off';

export interface JarvisPolicy {
  channels: Record<Channel, ChannelMode>;
  /** Approvals older than this are expired by the supervisor, never sent. */
  approvalTtlHours: number;
  /** Ceiling on agent LLM spend per rolling day. 0 disables the cap. */
  dailyTokenBudget: number;
  /** How many agent tasks may run at once. Keeps a burst from starving the UI. */
  maxConcurrentTasks: number;
}

export const DEFAULT_POLICY: JarvisPolicy = {
  channels: {
    'email.customer': 'approve',
    'sms.customer': 'approve',
    'email.marketing': 'approve',
    'sms.marketing': 'approve',
    'social.post': 'approve',
    'website.content': 'approve',
    'website.technical': 'approve',
    'calendar.write': 'approve',
    'crm.write': 'auto', // internal record-keeping; reversible, never leaves the business
    'accounting.write': 'approve',
    'payment.write': 'approve',
  },
  approvalTtlHours: 72,
  dailyTokenBudget: 2_000_000,
  maxConcurrentTasks: 3,
};

const POLICY_KEY = 'jarvis_policy';

export function getPolicy(): JarvisPolicy {
  const stored = getSetting<Partial<JarvisPolicy>>(POLICY_KEY, {});

  const channels = { ...DEFAULT_POLICY.channels };
  for (const channel of CHANNELS) {
    const mode = stored.channels?.[channel];
    // Unrecognised value → fall back to the default, which is 'approve'.
    if (mode === 'auto' || mode === 'approve' || mode === 'off') channels[channel] = mode;
  }
  for (const channel of ALWAYS_APPROVE) {
    if (channels[channel] === 'auto') channels[channel] = 'approve';
  }

  return {
    channels,
    approvalTtlHours: positive(stored.approvalTtlHours, DEFAULT_POLICY.approvalTtlHours),
    dailyTokenBudget: nonNegative(stored.dailyTokenBudget, DEFAULT_POLICY.dailyTokenBudget),
    maxConcurrentTasks: clamp(
      positive(stored.maxConcurrentTasks, DEFAULT_POLICY.maxConcurrentTasks),
      1,
      10
    ),
  };
}

export function setPolicy(patch: Partial<JarvisPolicy>): JarvisPolicy {
  const next: JarvisPolicy = { ...getPolicy(), ...patch };
  if (patch.channels) next.channels = { ...getPolicy().channels, ...patch.channels };
  for (const channel of ALWAYS_APPROVE) {
    if (next.channels[channel] === 'auto') next.channels[channel] = 'approve';
  }
  setSetting(POLICY_KEY, next);
  return next;
}

/** The single question the connector layer asks before doing anything outbound. */
export function channelMode(channel: Channel): ChannelMode {
  return getPolicy().channels[channel] ?? 'approve';
}

// ── Agent enablement ─────────────────────────────────────────────────────────
//
// Stored separately from the policy so toggling an agent off in an incident is
// one small write that cannot clobber the approval settings.

const DISABLED_KEY = 'jarvis_disabled_agents';

export function disabledAgents(): string[] {
  const raw = getSetting<unknown>(DISABLED_KEY, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export function setAgentEnabled(agent: string, enabled: boolean): void {
  const current = new Set(disabledAgents());
  if (enabled) current.delete(agent);
  else current.add(agent);
  setSetting(DISABLED_KEY, [...current]);
}

export function agentEnabled(agent: string): boolean {
  return !disabledAgents().includes(agent);
}

// ── Runtime / model configuration ────────────────────────────────────────────
//
// These stay in env: they are credentials and deployment shape, not policy.

/**
 * Agents run on a different model from the customer-facing chat assistant in
 * lib/ai.ts — they do multi-step tool use and reason over business data, where
 * the assistant answers one pricing question at a time.
 */
export const AGENT_MODEL = (): string =>
  process.env.JARVIS_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5';

/** The voice loop wants a fast model — the owner is standing there waiting. */
export const VOICE_MODEL = (): string =>
  process.env.JARVIS_VOICE_MODEL?.trim() || 'claude-haiku-4-5-20251001';

export const WAKE_PHRASE = (): string =>
  process.env.NEXT_PUBLIC_JARVIS_WAKE_PHRASE?.trim() || 'hey jarvis';

/**
 * Shared secret for the orchestrator's own scheduled tick, mirroring the
 * existing CRON_SECRET convention used by app/api/cron/reminders.
 */
export const cronSecret = (): string | undefined =>
  process.env.JARVIS_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();

// ── Small numeric guards ─────────────────────────────────────────────────────

function positive(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}
function nonNegative(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

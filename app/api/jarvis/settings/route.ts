// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/jarvis/settings — the current policy
// POST /api/jarvis/settings — change autonomy, budgets, or which agents run
//
// Owner-only. This endpoint decides whether an agent may email a customer
// without a human first — the single most consequential setting in the system —
// so it sits at the top role and every change is audited with its before and
// after values.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, fail, withAuth, str, int } from '@/lib/api';
import {
  CHANNELS,
  CHANNEL_LABEL,
  Channel,
  ChannelMode,
  disabledAgents,
  getPolicy,
  setAgentEnabled,
  setPolicy,
} from '@/lib/jarvis/config';
import { allAgents } from '@/lib/jarvis/registry';
import { ensureAgentsRegistered } from '@/lib/jarvis/agents';
import { audit } from '@/lib/repo/audit';

export const GET = withAuth('admin', async () => {
  ensureAgentsRegistered();
  return ok({
    policy: getPolicy(),
    channels: CHANNELS.map((c) => ({ id: c, label: CHANNEL_LABEL[c] })),
    agents: allAgents().map((a) => ({
      name: a.name,
      label: a.label,
      purpose: a.purpose,
      enabled: !disabledAgents().includes(a.name),
      tasks: Object.keys(a.tasks),
      schedule: a.schedule ?? [],
    })),
  });
});

interface SettingsBody {
  channels?: unknown;
  approvalTtlHours?: unknown;
  dailyTokenBudget?: unknown;
  maxConcurrentTasks?: unknown;
  agent?: unknown;
  enabled?: unknown;
}

const MODES: ChannelMode[] = ['auto', 'approve', 'off'];

export const POST = withAuth<SettingsBody>(
  'owner',
  async ({ user, body, ipHash }) => {
    const before = getPolicy();

    // Toggling one agent is its own small operation — see config.ts for why it
    // is kept separate from the approval policy.
    if (typeof body?.agent === 'string') {
      ensureAgentsRegistered();
      const name = str(body.agent, 40);
      if (!allAgents().some((a) => a.name === name)) return fail('No such agent.', 400);

      setAgentEnabled(name, body.enabled === true);
      audit({
        actorId: user.id,
        actorRole: user.role,
        action: 'jarvis.agent_toggle',
        entity: 'jarvis_agent',
        entityId: name,
        meta: { enabled: body.enabled === true },
        ipHash,
      });
      return ok({ agent: name, enabled: body.enabled === true });
    }

    const channels: Partial<Record<Channel, ChannelMode>> = {};
    if (body?.channels && typeof body.channels === 'object') {
      for (const [key, value] of Object.entries(body.channels as Record<string, unknown>)) {
        if ((CHANNELS as readonly string[]).includes(key) && MODES.includes(value as ChannelMode)) {
          channels[key as Channel] = value as ChannelMode;
        }
      }
    }

    const policy = setPolicy({
      ...(Object.keys(channels).length ? { channels: channels as Record<Channel, ChannelMode> } : {}),
      ...(body?.approvalTtlHours !== undefined
        ? { approvalTtlHours: int(body.approvalTtlHours, before.approvalTtlHours) }
        : {}),
      ...(body?.dailyTokenBudget !== undefined
        ? { dailyTokenBudget: int(body.dailyTokenBudget, before.dailyTokenBudget) }
        : {}),
      ...(body?.maxConcurrentTasks !== undefined
        ? { maxConcurrentTasks: int(body.maxConcurrentTasks, before.maxConcurrentTasks) }
        : {}),
    });

    // Both sides are recorded. "Who turned on automatic customer email, and
    // when" is exactly the question asked after something goes out unexpectedly.
    audit({
      actorId: user.id,
      actorRole: user.role,
      action: 'jarvis.policy_update',
      entity: 'jarvis_policy',
      meta: { before: before.channels, after: policy.channels },
      ipHash,
    });

    return ok({ policy });
  },
  { limit: 'api' }
);

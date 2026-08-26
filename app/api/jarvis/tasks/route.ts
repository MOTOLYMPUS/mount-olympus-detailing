// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/jarvis/tasks — the queue
// POST /api/jarvis/tasks — queue work by hand (the typed fallback to voice)
// ─────────────────────────────────────────────────────────────────────────────

import { ok, fail, withAuth, str, text } from '@/lib/api';
import { PRIORITY, enqueue, listTasks, TaskStatus, TASK_STATUSES } from '@/lib/jarvis/queue';
import { getAgent } from '@/lib/jarvis/registry';
import { ensureAgentsRegistered } from '@/lib/jarvis/agents';
import { audit } from '@/lib/repo/audit';

export const GET = withAuth('manager', async ({ query }) => {
  const status = query.get('status');
  const agent = query.get('agent');

  return ok({
    tasks: listTasks({
      status: (TASK_STATUSES as readonly string[]).includes(status ?? '')
        ? (status as TaskStatus)
        : undefined,
      agent: agent || undefined,
      limit: Number(query.get('limit')) || 50,
    }),
  });
});

interface CreateBody {
  agent?: unknown;
  kind?: unknown;
  notes?: unknown;
}

export const POST = withAuth<CreateBody>(
  'manager',
  async ({ user, body, ipHash }) => {
    ensureAgentsRegistered();

    const agentName = str(body?.agent, 40);
    const kind = str(body?.kind, 60);

    const agent = getAgent(agentName);
    if (!agent) return fail('No such agent.', 400, { agent: 'Unknown agent.' });
    if (!agent.tasks[kind]) {
      return fail(`${agent.label} cannot do that.`, 400, {
        kind: `Known: ${Object.keys(agent.tasks).join(', ')}`,
      });
    }

    const { task, created } = enqueue({
      agent: agentName,
      kind,
      title: agent.tasks[kind].title,
      input: { notes: text(body?.notes, 2000) },
      // Someone is sitting at the dashboard waiting, so this outranks scheduled
      // work — but not an incident.
      priority: PRIORITY.VOICE,
      createdBy: user.id,
      // Suppresses double-clicks and a second identical request while the first
      // is still running.
      dedupeKey: `manual:${agentName}:${kind}`,
    });

    audit({
      actorId: user.id,
      actorRole: user.role,
      action: 'jarvis.task_create',
      entity: 'jarvis_task',
      entityId: task.id,
      meta: { agent: agentName, kind },
      ipHash,
    });

    return ok({
      task,
      created,
      message: created
        ? `Queued for the ${agent.label}.`
        : 'That is already queued — not duplicating it.',
    });
  },
  { limit: 'api' }
);

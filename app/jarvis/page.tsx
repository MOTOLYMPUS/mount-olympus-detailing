// ─────────────────────────────────────────────────────────────────────────────
// /jarvis — the console.
//
// Voice first: the microphone is the top of the page and everything else is
// context for what it just did. The rest is a server component reading the same
// repositories the admin dashboard uses, so the page renders in one pass with
// no loading states.
//
// The "not configured yet" banners are deliberate and prominent. The single
// worst experience this system could offer is silently doing nothing because a
// key is missing — the owner would conclude the whole thing is broken.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader, StatTile } from '@/components/ui';
import VoiceConsole from '@/components/jarvis/VoiceConsole';
import AgentLauncher from '@/components/jarvis/AgentLauncher';
import { requireRolePage } from '@/lib/guards';
import { WAKE_PHRASE } from '@/lib/jarvis/config';
import { orchestratorStatus } from '@/lib/jarvis/orchestrator';
import { listTasks } from '@/lib/jarvis/queue';
import { listApprovals } from '@/lib/jarvis/approvals';
import { agentStates } from '@/lib/jarvis/logs';
import { llmConfigured } from '@/lib/jarvis/llm';
import { connectorStatuses } from '@/lib/jarvis/connectors';
import { speechCapabilities } from '@/lib/jarvis/speech';
import { allAgents } from '@/lib/jarvis/registry';
import { ensureAgentsRegistered } from '@/lib/jarvis/agents';
import { relativeTime } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

export default async function JarvisConsolePage() {
  await requireRolePage('manager', '/jarvis');
  ensureAgentsRegistered();

  const status = orchestratorStatus();
  const recent = listTasks({ limit: 8 });
  const pending = listApprovals({ status: 'pending', limit: 5 });
  const states = agentStates();
  const connectors = connectorStatuses();
  const speech = speechCapabilities();
  const agents = allAgents();

  const unconfigured = connectors.filter((c) => !c.configured && c.name !== 'payments');
  const failing = states.filter((s) => s.consecutiveFailures >= 3);

  return (
    <>
      <PageHeader
        eyebrow="Project Olympus"
        title="Jarvis"
        description={`Say “${WAKE_PHRASE()}”, then ask. Everything that would reach a customer is drafted and waits for you.`}
      />

      {!llmConfigured() && (
        <div className="mb-6">
          <Alert tone="warning" title="Agents cannot think yet">
            <code>ANTHROPIC_API_KEY</code> is not set, so no agent can reason and voice replies will
            fail. The queue, scheduler, approvals, and dashboard all work without it — add the key
            to <code>.env.local</code> and restart to switch the agents on.
          </Alert>
        </div>
      )}

      {failing.length > 0 && (
        <div className="mb-6">
          <Alert tone="danger" title="An agent is failing repeatedly">
            {failing.map((s) => `${s.agent}: ${s.lastError ?? 'unknown error'}`).join(' · ')}
          </Alert>
        </div>
      )}

      <div className="mb-8">
        <VoiceConsole wakePhrase={WAKE_PHRASE()} />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Queued" value={String(status.queue.queued)} sub="waiting to run" />
        <StatTile label="Running" value={String(status.queue.running)} sub="in flight" />
        <StatTile
          label="Awaiting you"
          value={String(status.pendingApprovals)}
          sub="approvals pending"
        />
        <StatTile label="Done today" value={String(status.queue.doneToday)} sub="tasks completed" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle
              action={
                <Link href="/jarvis/activity" className="text-[11px] text-subtle hover:text-white">
                  All activity →
                </Link>
              }
            >
              Recent tasks
            </CardTitle>

            {recent.length === 0 ? (
              <EmptyState
                title="Nothing has run yet"
                description="Ask Jarvis for something out loud, or start an agent below. Scheduled work queues itself on the next tick."
              />
            ) : (
              <ul className="divide-y divide-white/5">
                {recent.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{task.title}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-subtle">
                        {task.agent} · {relativeTime(task.createdAt)}
                        {task.durationMs ? ` · ${Math.round(task.durationMs / 1000)}s` : ''}
                      </p>
                    </div>
                    <Badge tone={taskTone(task.status)}>{task.status.replace('_', ' ')}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Start an agent</CardTitle>
            <AgentLauncher
              agents={agents.map((a) => ({
                name: a.name,
                label: a.label,
                purpose: a.purpose,
                enabled: status.agents.find((s) => s.name === a.name)?.enabled ?? true,
                tasks: Object.entries(a.tasks).map(([kind, def]) => ({ kind, title: def.title })),
              }))}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle
              action={
                <Link href="/jarvis/approvals" className="text-[11px] text-subtle hover:text-white">
                  All →
                </Link>
              }
            >
              Waiting for you
            </CardTitle>

            {pending.length === 0 ? (
              <p className="text-sm text-muted">Nothing needs your approval.</p>
            ) : (
              <ul className="space-y-3">
                {pending.map((approval) => (
                  <li key={approval.id} className="rounded-sm border border-white/10 p-3">
                    <p className="text-sm text-white">{approval.summary}</p>
                    <p className="mt-1 font-mono text-[11px] text-subtle">
                      {approval.agent} · {approval.channel} · {relativeTime(approval.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Agents</CardTitle>
            <ul className="space-y-2">
              {status.agents.map((agent) => {
                const state = states.find((s) => s.agent === agent.name);
                return (
                  <li key={agent.name} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-muted">{agent.label}</span>
                    <Badge
                      tone={
                        !agent.enabled
                          ? 'neutral'
                          : (state?.consecutiveFailures ?? 0) >= 3
                            ? 'danger'
                            : state?.lastSuccessAt
                              ? 'positive'
                              : 'neutral'
                      }
                    >
                      {!agent.enabled ? 'off' : state?.lastSuccessAt ? 'ok' : 'idle'}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardTitle>Integrations</CardTitle>
            {unconfigured.length === 0 ? (
              <p className="text-sm text-muted">Everything is connected.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">
                  {unconfigured.length} not connected. Agents will draft the work and tell you it
                  could not be sent.
                </p>
                <ul className="space-y-1.5">
                  {unconfigured.map((c) => (
                    <li key={c.name} className="font-mono text-[11px] text-subtle">
                      {c.label} — needs {c.missing.join(', ')}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <CardTitle>Voice</CardTitle>
            <p className="text-sm text-muted">{speech.note}</p>
            <p className="mt-2 font-mono text-[11px] text-subtle">
              provider: {speech.provider} · offline: {speech.offline ? 'yes' : 'no'}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function taskTone(status: string) {
  switch (status) {
    case 'done':
      return 'positive' as const;
    case 'failed':
      return 'danger' as const;
    case 'running':
      return 'info' as const;
    case 'waiting_approval':
      return 'warning' as const;
    default:
      return 'neutral' as const;
  }
}

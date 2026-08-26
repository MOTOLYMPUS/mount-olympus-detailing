// ─────────────────────────────────────────────────────────────────────────────
// /jarvis/activity — what the agents have been doing.
//
// Task results are rendered in full. An agent's report is the product — a
// dashboard that truncates it to two lines makes the owner click into every
// single one, which is the opposite of a summary.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import clsx from 'clsx';
import { Badge, Card, CardTitle, EmptyState, PageHeader, StatTile } from '@/components/ui';
import TickButton from '@/components/jarvis/TickButton';
import { requireRolePage } from '@/lib/guards';
import { atLeast } from '@/lib/rbac';
import { listTasks, queueDepth, TaskStatus, TASK_STATUSES } from '@/lib/jarvis/queue';
import { agentMetrics, listEvents } from '@/lib/jarvis/logs';
import { recentVoiceTurns } from '@/lib/jarvis/voice';
import { relativeTime } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Running' },
  { key: 'done', label: 'Done' },
  { key: 'failed', label: 'Failed' },
];

export default function ActivityPage({ searchParams }: { searchParams?: { status?: string } }) {
  const user = requireRolePage('manager', '/jarvis/activity');

  const filter = searchParams?.status ?? 'all';
  const status = (TASK_STATUSES as readonly string[]).includes(filter)
    ? (filter as TaskStatus)
    : undefined;

  const tasks = listTasks({ status, limit: 40 });
  const depth = queueDepth();
  const metrics = agentMetrics(new Date(Date.now() - 7 * 86_400_000).toISOString());
  const errors = listEvents({ level: 'error', limit: 15 });
  const voice = recentVoiceTurns(10);

  return (
    <>
      <PageHeader
        eyebrow="Jarvis"
        title="Activity"
        description="Every task, its result, and what went wrong."
        action={atLeast(user.role, 'admin') ? <TickButton /> : undefined}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Queued" value={String(depth.queued)} />
        <StatTile label="Running" value={String(depth.running)} />
        <StatTile label="Awaiting approval" value={String(depth.waitingApproval)} />
        <StatTile label="Failed" value={String(depth.failed)} />
        <StatTile label="Done today" value={String(depth.doneToday)} />
      </div>

      <nav className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'all' ? '/jarvis/activity' : `/jarvis/activity?status=${f.key}`}
            className={clsx(
              'rounded-sm border px-3 py-1.5 text-[12px] transition-colors',
              filter === f.key
                ? 'border-white/40 text-white'
                : 'border-white/10 text-muted hover:border-white/30 hover:text-white'
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {tasks.length === 0 ? (
            <EmptyState
              title="Nothing here"
              description="No tasks match that filter. Queue one from the console, or wait for the next scheduled run."
            />
          ) : (
            tasks.map((task) => {
              const summary = typeof task.result?.summary === 'string' ? task.result.summary : null;
              const tools = Array.isArray(task.result?.toolsUsed)
                ? (task.result.toolsUsed as string[])
                : [];

              return (
                <Card key={task.id}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{task.title}</p>
                      <p className="mt-1 font-mono text-[11px] text-subtle">
                        {task.agent} · {task.kind} · {relativeTime(task.createdAt)}
                        {task.durationMs ? ` · ${Math.round(task.durationMs / 1000)}s` : ''}
                        {task.costTokens ? ` · ${task.costTokens.toLocaleString()} tokens` : ''}
                        {task.attempts > 1 ? ` · attempt ${task.attempts}` : ''}
                      </p>
                    </div>
                    <Badge tone={tone(task.status)}>{task.status.replace('_', ' ')}</Badge>
                  </div>

                  {summary && (
                    <div className="whitespace-pre-wrap rounded-sm border border-white/10 bg-obsidian/50 p-4 text-sm leading-relaxed text-muted">
                      {summary}
                    </div>
                  )}

                  {task.error && (
                    <p className="mt-2 rounded-sm border border-apex/40 bg-apex/5 px-3 py-2 text-[13px] text-red-100">
                      {task.error}
                    </p>
                  )}

                  {tools.length > 0 && (
                    <p className="mt-3 font-mono text-[10px] text-subtle">
                      used: {tools.join(', ')}
                    </p>
                  )}
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Last 7 days</CardTitle>
            {metrics.length === 0 ? (
              <p className="text-sm text-muted">No agent has run this week.</p>
            ) : (
              <ul className="space-y-2">
                {metrics.map((m) => (
                  <li key={m.agent} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-muted">{m.agent}</span>
                    <span className="font-mono text-[11px] text-subtle">
                      {m.completed} ok
                      {m.failed > 0 && <span className="text-flare"> · {m.failed} failed</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Recent errors</CardTitle>
            {errors.length === 0 ? (
              <p className="text-sm text-muted">No errors logged.</p>
            ) : (
              <ul className="space-y-3">
                {errors.map((event) => (
                  <li key={event.id}>
                    <p className="text-[13px] text-muted">{event.message}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-subtle">
                      {event.agent || 'system'} · {relativeTime(event.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Recent voice</CardTitle>
            {voice.length === 0 ? (
              <p className="text-sm text-muted">Nothing said yet.</p>
            ) : (
              <ul className="space-y-3">
                {voice.map((turn) => (
                  <li key={turn.id}>
                    <p className="text-[13px] text-white">&ldquo;{turn.transcript}&rdquo;</p>
                    <p className="mt-0.5 text-[12px] text-muted">{turn.reply}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-subtle">
                      {turn.intent}
                      {turn.agent ? ` → ${turn.agent}` : ''} · {relativeTime(turn.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function tone(status: string) {
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

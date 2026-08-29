// ─────────────────────────────────────────────────────────────────────────────
// /jarvis/approvals — everything waiting on a human yes.
// ─────────────────────────────────────────────────────────────────────────────

import { Card, CardTitle, PageHeader } from '@/components/ui';
import ApprovalQueue from '@/components/jarvis/ApprovalQueue';
import { requireRolePage } from '@/lib/guards';
import { atLeast } from '@/lib/rbac';
import { listApprovals } from '@/lib/jarvis/approvals';
import { relativeTime } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const user = await requireRolePage('manager', '/jarvis/approvals');

  const pending = listApprovals({ status: 'pending', limit: 50 });
  const recent = listApprovals({ limit: 60 }).filter((a) => a.status !== 'pending').slice(0, 20);

  return (
    <>
      <PageHeader
        eyebrow="Jarvis"
        title="Approvals"
        description="Nothing here has been sent. Read it, then decide."
      />

      <div className="mb-8">
        <ApprovalQueue
          approvals={pending.map((a) => ({
            id: a.id,
            agent: a.agent,
            channel: a.channel,
            action: a.action,
            summary: a.summary,
            payload: a.payload,
            risk: a.risk,
            status: a.status,
            createdAt: a.createdAt,
            expiresAt: a.expiresAt,
          }))}
          // Managers can read the queue but not act on it — see the note in
          // app/api/jarvis/approvals/route.ts.
          canDecide={atLeast(user.role, 'admin')}
        />
      </div>

      {recent.length > 0 && (
        <Card>
          <CardTitle>Recently decided</CardTitle>
          <ul className="divide-y divide-white/5">
            {recent.map((approval) => (
              <li key={approval.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted">{approval.summary}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-subtle">
                    {approval.agent} · {approval.action} ·{' '}
                    {relativeTime(approval.decidedAt ?? approval.createdAt)}
                    {approval.result ? ` · ${approval.result}` : ''}
                  </p>
                </div>
                <span
                  className={
                    approval.status === 'executed'
                      ? 'font-mono text-[11px] text-emerald-400'
                      : approval.status === 'failed'
                        ? 'font-mono text-[11px] text-flare'
                        : 'font-mono text-[11px] text-subtle'
                  }
                >
                  {approval.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

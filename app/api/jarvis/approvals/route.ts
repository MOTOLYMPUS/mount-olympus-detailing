// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/jarvis/approvals      — the approval queue
// POST /api/jarvis/approvals      — approve or reject, and execute on approval
//
// ADMIN AND ABOVE, not manager. Approving is the act of letting an agent reach a
// customer or the public; it is the highest-consequence button in the system and
// belongs with the people who answer for what goes out.
//
// On approval the connector runs IMMEDIATELY, with the stored payload, and the
// parked task resumes. Deferring execution to the next orchestrator tick would
// put an unpredictable delay between "approved" and "sent", which for a customer
// reply is exactly the wrong behaviour.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, fail, withAuth, str, text } from '@/lib/api';
import { decide, getApproval, listApprovals, ApprovalStatus } from '@/lib/jarvis/approvals';
import { executeApproval } from '@/lib/jarvis/connectors';
import { resume } from '@/lib/jarvis/queue';
import { audit } from '@/lib/repo/audit';

export const GET = withAuth('manager', async ({ query }) => {
  const status = query.get('status');
  return ok({
    approvals: listApprovals({
      status: (['pending', 'approved', 'rejected', 'executed', 'failed', 'expired'] as string[]).includes(
        status ?? ''
      )
        ? (status as ApprovalStatus)
        : undefined,
      limit: Number(query.get('limit')) || 50,
    }),
  });
});

interface DecideBody {
  id?: unknown;
  decision?: unknown;
  note?: unknown;
}

export const POST = withAuth<DecideBody>(
  'admin',
  async ({ user, body, ipHash }) => {
    const id = str(body?.id, 60);
    const decision = str(body?.decision, 20);

    if (decision !== 'approved' && decision !== 'rejected') {
      return fail('Decision must be "approved" or "rejected".', 400);
    }

    const existing = getApproval(id);
    if (!existing) return fail('No such approval.', 404);
    if (existing.status !== 'pending') {
      return fail(`That was already ${existing.status}.`, 409);
    }

    const approval = decide(id, decision, { userId: user.id, note: text(body?.note, 500) });
    // Null means the guarded UPDATE matched nothing — someone else decided it
    // between the read above and the write. Their decision stands.
    if (!approval) return fail('Someone else just decided that one.', 409);

    audit({
      actorId: user.id,
      actorRole: user.role,
      action: `jarvis.approval_${decision}`,
      entity: 'jarvis_approval',
      entityId: id,
      meta: { channel: approval.channel, action: approval.action, agent: approval.agent },
      ipHash,
    });

    if (decision === 'rejected') {
      return ok({ approval, message: 'Rejected. Nothing was sent.' });
    }

    const result = await executeApproval(approval);

    // The task resumes either way: an agent whose send failed should be told
    // so, not left parked forever.
    if (approval.taskId) {
      resume(approval.taskId, { approvalResult: result.detail, approvalOk: result.ok });
    }

    return ok({
      approval: getApproval(id),
      executed: result.ok,
      message: result.detail,
    });
  },
  { limit: 'api' }
);

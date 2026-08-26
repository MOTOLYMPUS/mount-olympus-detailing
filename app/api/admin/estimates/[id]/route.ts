// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/estimates/:id — move a quote request through the pipeline.
//
// The statuses are the ones the schema already defines on `estimate_requests`
// (new → contacted → scheduled → closed). They are validated against that exact
// list rather than accepted as free text, because `scheduledDates()` in
// lib/db.ts filters on `status = 'scheduled'` — a typo'd status would silently
// drop a booked date out of the marketing site's calendar.
//
// 'manager' rather than 'admin': chasing quotes is the job this role exists to
// do, and locking it behind admin would mean the person answering the phone
// cannot record that they answered it.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, str, withAuth } from '@/lib/api';
import { getEstimateRequest, setEstimateStatus } from '@/lib/db';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'contacted', 'scheduled', 'closed'] as const;
type EstimateStatus = (typeof STATUSES)[number];

export const PATCH = withAuth('manager', async ({ user, params, body, ipHash }) => {
  const estimate = getEstimateRequest(params.id);
  if (!estimate) return fail('That estimate request no longer exists.', 404);

  const b = (body ?? {}) as Record<string, unknown>;
  const status = str(b.status, 20) as EstimateStatus;
  if (!(STATUSES as readonly string[]).includes(status)) {
    return fail('Unknown status.', 400, { status: 'Choose a status.' });
  }

  setEstimateStatus(estimate.id, status);

  audit({
    actorId: user.id,
    actorRole: user.role,
    // 'scheduled' is the conversion event the funnel report counts, so it is
    // recorded distinctly from a simple decline.
    action: status === 'scheduled' ? AUDIT.ESTIMATE_ACCEPT : AUDIT.ESTIMATE_DECLINE,
    entity: 'estimate',
    entityId: estimate.id,
    meta: { from: estimate.status, to: status, reference: estimate.reference },
    ipHash,
  });

  return ok({ estimate: { ...estimate, status } });
});

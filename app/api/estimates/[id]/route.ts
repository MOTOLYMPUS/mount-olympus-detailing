// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/estimates/:id — accept or decline a quote.
//
// Estimates predate accounts: the public site lets anyone request one without
// signing up. They are therefore linked to a customer by EMAIL, not by a user
// id. The ownership check below is "the signed-in user's email matches the
// address on the quote" — which is exactly how a guest quote becomes visible
// once that person registers.
//
// Staff can act on any estimate, so an owner can accept one over the phone.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, str, withAuth } from '@/lib/api';
import { getEstimateRequest, setEstimateStatus } from '@/lib/db';
import { AUDIT, audit } from '@/lib/repo/audit';
import { canManage } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What a customer may set. 'scheduled' and 'closed' are staff-only. */
const CUSTOMER_ACTIONS = ['accepted', 'declined'] as const;
const STAFF_STATUSES = ['new', 'contacted', 'accepted', 'declined', 'scheduled', 'closed'];

export const PATCH = withAuth('any', async ({ user, params, body }) => {
  const estimate = getEstimateRequest(params.id);
  if (!estimate) return fail('Quote not found.', 404);

  const owns = estimate.email.toLowerCase() === user.email.toLowerCase();
  const staff = canManage(user.role);
  if (!owns && !staff) return fail('Quote not found.', 404);

  const status = str((body as Record<string, unknown>)?.status, 20);

  if (staff) {
    if (!STAFF_STATUSES.includes(status)) return fail('Unknown status.', 400);
  } else if (!(CUSTOMER_ACTIONS as readonly string[]).includes(status)) {
    return fail('You can accept or decline this quote.', 400);
  }

  // Accepting an already-scheduled quote would be a no-op that looks like it
  // worked; say so instead.
  if (estimate.status === 'scheduled' && !staff) {
    return fail('This quote has already been turned into a booking.', 409);
  }

  setEstimateStatus(estimate.id, status);

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: status === 'accepted' ? AUDIT.ESTIMATE_ACCEPT : AUDIT.ESTIMATE_DECLINE,
    entity: 'estimate',
    entityId: estimate.id,
    meta: { status, reference: estimate.reference },
  });

  return ok({ estimate: { ...estimate, status } });
});

export const GET = withAuth('any', async ({ user, params }) => {
  const estimate = getEstimateRequest(params.id);
  if (!estimate) return fail('Quote not found.', 404);

  const owns = estimate.email.toLowerCase() === user.email.toLowerCase();
  if (!owns && !canManage(user.role)) return fail('Quote not found.', 404);

  return ok({ estimate });
});

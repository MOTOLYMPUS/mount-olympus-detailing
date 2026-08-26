// ─────────────────────────────────────────────────────────────────────────────
// POST /api/push/unsubscribe
//
// Called when the user turns push off from PushToggle, or when the browser's
// own subscription silently expired and the client wants the stale server
// record gone. Deletion is scoped to the caller's own subscriptions — the
// endpoint itself is effectively an unguessable secret, but there is no
// reason to trust it blindly when we can just check ownership first using the
// same listSubscriptions() the rest of this module already relies on.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, fail, withAuth } from '@/lib/api';
import { deleteSubscription, listSubscriptions } from '@/lib/repo/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UnsubscribeBody {
  endpoint?: unknown;
}

export const POST = withAuth<UnsubscribeBody>('any', async ({ user, body }) => {
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
  if (!endpoint) return fail('Missing endpoint.', 400, { endpoint: 'Required.' });

  const owned = listSubscriptions(user.id).some((s) => s.endpoint === endpoint);
  if (!owned) {
    // Not an error from the caller's point of view — if it's already gone (or
    // was never this user's), the desired end state ("not subscribed") holds.
    return ok({ unsubscribed: true });
  }

  deleteSubscription(endpoint);
  return ok({ unsubscribed: true });
});

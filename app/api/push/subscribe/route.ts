// ─────────────────────────────────────────────────────────────────────────────
// POST /api/push/subscribe
//
// The browser calls this right after `PushManager.subscribe()` succeeds,
// handing us the resulting subscription (endpoint + the two public keys the
// browser generated for itself). We persist it against the signed-in user so
// lib/push.ts can later encrypt messages against it.
//
// saveSubscription() upserts on endpoint (see lib/repo/notifications.ts), so a
// browser re-subscribing after a service-worker update or key rotation just
// replaces its old row rather than accumulating duplicates.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, fail, withAuth } from '@/lib/api';
import { saveSubscription } from '@/lib/repo/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SubscribeBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

export const POST = withAuth<SubscribeBody>('any', async ({ user, body, req }) => {
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
  const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh.trim() : '';
  const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth.trim() : '';

  const errors: Record<string, string> = {};
  // Push endpoints are always https (Google/Mozilla/Microsoft/Apple all serve
  // theirs over TLS) — rejecting anything else stops a malformed or spoofed
  // subscription from ever reaching lib/push.ts's fetch() call.
  if (!endpoint || !endpoint.startsWith('https://')) errors.endpoint = 'Invalid push endpoint.';
  if (!p256dh) errors.p256dh = 'Missing subscription key.';
  if (!auth) errors.auth = 'Missing subscription auth secret.';
  if (Object.keys(errors).length) return fail('Invalid push subscription.', 400, errors);

  saveSubscription({
    userId: user.id,
    endpoint,
    p256dh,
    auth,
    userAgent: req.headers.get('user-agent') ?? '',
  });

  return ok({ subscribed: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/push/vapid
//
// Hands the client the VAPID *public* key so it can call
// `PushManager.subscribe({ applicationServerKey })`. This is not sensitive —
// a VAPID public key is, by design, shared with every push service and every
// browser that subscribes; it's the private key (server-only, lib/push.ts)
// that must never leave the server. Available signed-out too, since a visitor
// browsing the public marketing pages may not yet have an account.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, withOptionalAuth } from '@/lib/api';
import { getVapidPublicKeyForClient } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withOptionalAuth(async () => {
  const publicKey = getVapidPublicKeyForClient();
  if (!publicKey) return ok({ configured: false });
  return ok({ configured: true, publicKey });
});

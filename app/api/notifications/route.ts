// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications — the signed-in user's notification bell: their
// recent notifications plus how many are unread.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, withAuth, int } from '@/lib/api';
import { listNotifications, unreadCount } from '@/lib/repo/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 100;

export const GET = withAuth('any', async ({ user, query }) => {
  const limit = Math.min(MAX_LIMIT, Math.max(1, int(query.get('limit'), 50)));

  return ok({
    notifications: listNotifications(user.id, limit),
    unreadCount: unreadCount(user.id),
  });
});

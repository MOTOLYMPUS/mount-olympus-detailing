// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications/read — { id?: string }
//
// With an id, marks that one notification read; without one, marks everything
// the user has read (the "mark all as read" action). Both are scoped to the
// caller's own notifications inside markRead() itself, so there's no way to
// mark someone else's row read by guessing an id.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, withAuth } from '@/lib/api';
import { markRead } from '@/lib/repo/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReadBody {
  id?: unknown;
}

export const POST = withAuth<ReadBody>('any', async ({ user, body }) => {
  const id = typeof body?.id === 'string' && body.id ? body.id : undefined;
  markRead(user.id, id);
  return ok({ read: true });
});

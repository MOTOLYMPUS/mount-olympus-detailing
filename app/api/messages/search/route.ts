// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/search?q=… — search the caller's own threads.
//
// searchMessages() joins through conversation_members, so the scope is enforced
// in the QUERY rather than by filtering results afterwards. There is no code
// path here that loads a non-member's messages and then discards them.
//
// This route sits above /api/messages/[id] in Next's matching order because a
// static segment always beats a dynamic one — "search" can never be read as a
// conversation id.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { str, withAuth } from '@/lib/api';
import { searchMessages } from '@/lib/repo/messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('staff', async ({ user, query }) => {
  const q = str(query.get('q'), 100).trim();

  // A one-character query matches nearly everything and is never a real search;
  // returning empty is more honest than returning the whole inbox.
  if (q.length < 2) return NextResponse.json({ ok: true, results: [], query: q });

  return NextResponse.json({
    ok: true,
    query: q,
    results: searchMessages(user.id, q, Math.min(100, Number(query.get('limit')) || 50)),
  });
});

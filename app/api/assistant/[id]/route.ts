// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/assistant/[id]  — the messages in one conversation
// DELETE /api/assistant/[id]  — delete it
//
// Both are scoped to the OWNER. `withAuth('any')` establishes that there is a
// session; the ownership check below is what actually protects the row, because
// a conversation id in a URL is guessable-shaped and must not be sufficient.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, withAuth } from '@/lib/api';
import { deleteConversation, getConversation, listMessages } from '@/lib/repo/assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('any', async ({ user, params }) => {
  const conversation = getConversation(params.id);
  // Same response for "does not exist" and "not yours" — distinguishing them
  // would confirm the existence of another user's conversation.
  if (!conversation || conversation.userId !== user.id) {
    return fail('Conversation not found.', 404);
  }

  return NextResponse.json({
    ok: true,
    conversation,
    messages: listMessages(conversation.id),
  });
});

export const DELETE = withAuth('any', async ({ user, params }) => {
  const conversation = getConversation(params.id);
  if (!conversation || conversation.userId !== user.id) {
    return fail('Conversation not found.', 404);
  }

  // The repo query is itself scoped by user id — belt and braces.
  deleteConversation(conversation.id, user.id);
  return ok({ deleted: conversation.id });
});

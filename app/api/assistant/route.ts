// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/assistant  — list the signed-in user's conversations
// POST /api/assistant  — ask the assistant a question
//
// `withOptionalAuth` because the assistant is deliberately open to anonymous
// visitors: someone comparing ceramic coating prices should not have to make an
// account first. Nothing anonymous is PERSISTED, though — see the header of
// lib/repo/assistant.ts for why storing identifiable questions against no
// account and no consent is the wrong trade.
//
// The 'assistant' rate-limit bucket is the AI cost control at the edge; lib/ai.ts
// caps history length as the cost control per call.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, str, text, withOptionalAuth } from '@/lib/api';
import { askAssistant, aiConfigured, AssistantMessageInput } from '@/lib/ai';
import {
  appendMessage,
  createConversation,
  getConversation,
  listConversations,
  listMessages,
  setTitle,
} from '@/lib/repo/assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Longest single question we will forward. Longer is a paste, not a question. */
const MAX_QUESTION = 4000;

export const GET = withOptionalAuth(async ({ user }) => {
  if (!user) return NextResponse.json({ ok: true, conversations: [], configured: aiConfigured() });
  return NextResponse.json({
    ok: true,
    conversations: listConversations(user.id),
    configured: aiConfigured(),
  });
});

export const POST = withOptionalAuth(
  async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;

    const message = text(b.message, MAX_QUESTION).trim();
    if (!message) return fail('Please type a question.', 400, { message: 'Please type a question.' });

    // ── Anonymous: stateless. History comes from the client, is used for this
    // one call, and is written nowhere. ─────────────────────────────────────
    if (!user) {
      const clientHistory = Array.isArray(b.history) ? b.history : [];
      const history: AssistantMessageInput[] = clientHistory
        .filter(
          (m): m is { role: string; content: string } =>
            !!m && typeof m === 'object' && typeof (m as any).content === 'string'
        )
        .map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: String(m.content).slice(0, MAX_QUESTION),
        }));

      const result = await askAssistant({
        messages: [...history, { role: 'user', content: message }],
        user: null,
      });

      return ok({ ...result, conversationId: null, persisted: false });
    }

    // ── Signed in: create-or-continue a conversation. ────────────────────────
    const requestedId = str(b.conversationId, 60);
    let conversation = requestedId ? getConversation(requestedId) : null;

    // Ownership check, not just existence — a guessed id must not open someone
    // else's thread.
    if (conversation && conversation.userId !== user.id) conversation = null;

    const isNew = !conversation;
    if (!conversation) conversation = createConversation(user.id);

    // History comes from the DATABASE, never from the client, so a caller
    // cannot forge prior assistant turns to steer the model.
    const priorMessages = listMessages(conversation.id).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    appendMessage(conversation.id, 'user', message);
    if (isNew) {
      // First question becomes the title so the sidebar is scannable.
      setTitle(conversation.id, message.replace(/\s+/g, ' ').slice(0, 80));
    }

    const result = await askAssistant({
      messages: [...priorMessages, { role: 'user', content: message }],
      user,
      conversationId: conversation.id,
    });

    appendMessage(conversation.id, 'assistant', result.reply);

    return ok({
      ...result,
      conversationId: conversation.id,
      persisted: true,
      title: getConversation(conversation.id)?.title ?? '',
    });
  },
  { limit: 'assistant' }
);

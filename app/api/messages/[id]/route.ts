// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/messages/[id]  — read a thread (and mark it read)
// POST /api/messages/[id]  — send into it
//
// Both call isMember() FIRST. That check, not the role, is what authorises the
// request — see the header of lib/repo/messages.ts. A 404 rather than a 403 for
// non-members: telling someone "that room exists but you're not in it" leaks the
// existence of the room.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, text, withAuth } from '@/lib/api';
import {
  getConversation,
  isMember,
  listMessages,
  markConversationRead,
  memberIds,
  readReceipts,
  sendMessage,
} from '@/lib/repo/messages';
import { Attachment, STAFF_ROLES } from '@/lib/models';
import { listUsers } from '@/lib/repo/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 5000;
const MAX_ATTACHMENTS = 10;

/**
 * Attachments arrive as the JSON that POST /api/uploads returned. Re-shaped and
 * bounded here rather than stored as-received: the client could otherwise put
 * an arbitrary external URL into a message and render it inside the app.
 */
function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  const out: Attachment[] = [];
  for (const raw of value.slice(0, MAX_ATTACHMENTS)) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const url = String(a.url ?? '');
    // Only our own upload-serving route. Nothing off-origin.
    if (!/^\/api\/files\/[a-z]+\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/.test(url)) continue;
    out.push({
      url,
      name: String(a.name ?? url.split('/').pop() ?? 'attachment').slice(0, 120),
      contentType: String(a.contentType ?? a.mime ?? 'application/octet-stream').slice(0, 100),
      size: Number(a.size) || 0,
    });
  }
  return out;
}

/**
 * Resolve `@name` tokens in the body to user IDs, server-side.
 *
 * Only members of THIS conversation can be mentioned — a mention is a
 * notification hook, and being able to mention (and therefore ping) someone
 * outside the room would leak that the room exists.
 */
function resolveMentions(body: string, conversationId: string): string[] {
  const tokens = Array.from(body.matchAll(/@([\p{L}][\p{L}\p{N}._'-]{0,40})/gu)).map((m) =>
    m[1].toLowerCase()
  );
  if (!tokens.length) return [];

  const ids = new Set(memberIds(conversationId));
  const members = listUsers({ roles: [...STAFF_ROLES], limit: 500 }).filter((u) => ids.has(u.id));

  const matched = new Set<string>();
  for (const token of tokens) {
    for (const member of members) {
      const first = member.name.split(/\s+/)[0]?.toLowerCase() ?? '';
      const full = member.name.toLowerCase().replace(/\s+/g, '');
      const handle = member.email.split('@')[0].toLowerCase();
      if (token === first || token === full || token === handle) matched.add(member.id);
    }
  }
  return Array.from(matched);
}

export const GET = withAuth('staff', async ({ user, params, query }) => {
  const conversation = getConversation(params.id);
  if (!conversation || !isMember(conversation.id, user.id)) {
    return fail('Conversation not found.', 404);
  }

  const messages = listMessages(conversation.id, {
    limit: Math.min(200, Number(query.get('limit')) || 100),
    before: query.get('before') ?? undefined,
  });

  // Opening a thread is what marks it read. Done after the read so the caller
  // still sees which messages were new in this response.
  markConversationRead(conversation.id, user.id);

  return NextResponse.json({
    ok: true,
    conversation,
    messages,
    receipts: readReceipts(conversation.id),
    memberIds: memberIds(conversation.id),
  });
});

export const POST = withAuth(
  'staff',
  async ({ user, params, body }) => {
    const conversation = getConversation(params.id);
    if (!conversation || !isMember(conversation.id, user.id)) {
      return fail('Conversation not found.', 404);
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const messageBody = text(b.body, MAX_BODY).trim();
    const attachments = parseAttachments(b.attachments);

    if (!messageBody && !attachments.length) {
      return fail('Write something first.', 400);
    }

    const message = sendMessage({
      conversationId: conversation.id,
      senderId: user.id,
      body: messageBody,
      attachments,
      mentions: resolveMentions(messageBody, conversation.id),
    });

    return ok({ message }, { status: 201 });
  },
  { limit: 'message' }
);

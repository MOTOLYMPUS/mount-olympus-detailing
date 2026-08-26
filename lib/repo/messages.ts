// ─────────────────────────────────────────────────────────────────────────────
// Internal team messaging.
//
// ACCESS RULE: membership of a conversation is the *only* thing that grants
// access to its messages. Every read path in this file joins through
// `conversation_members`, so there is no query that can return a message to
// someone who is not in the room — not even for an admin, who must be added to
// a conversation like anyone else.
//
// Read receipts are per-member `last_read_at` watermarks rather than a row per
// message per member: O(members) storage instead of O(members × messages).
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { Attachment, Conversation, ConversationKind, ConversationSummary, Message } from '../models';

function toConversation(row: Row): Conversation {
  return {
    id: row.id,
    kind: row.kind as ConversationKind,
    title: row.title,
    jobId: row.job_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: Row): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id ?? null,
    body: row.body,
    attachments: json<Attachment[]>(row.attachments, []),
    mentions: json<string[]>(row.mentions, []),
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

export function createConversation(input: {
  kind: ConversationKind;
  title: string;
  memberIds: string[];
  createdBy: string;
  jobId?: string | null;
}): Conversation {
  const id = crypto.randomUUID();
  const now = nowIso();
  const db = getDb();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO conversations (id, kind, title, job_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.kind, input.title, input.jobId ?? null, input.createdBy, now, now);

    const stmt = db.prepare(
      `INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at)
       VALUES (?, ?, ?)`
    );
    for (const userId of new Set([...input.memberIds, input.createdBy])) {
      stmt.run(id, userId, now);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return getConversation(id)!;
}

export function getConversation(id: string): Conversation | null {
  const row = getDb().prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as Row | undefined;
  return row ? toConversation(row) : null;
}

export function isMember(conversationId: string, userId: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 AS x FROM conversation_members WHERE conversation_id = ? AND user_id = ?`)
    .get(conversationId, userId) as Row | undefined;
  return !!row;
}

/**
 * A direct conversation between exactly two people, created on demand. Looked
 * up by member set rather than by title so opening a DM twice does not create
 * two rooms.
 */
export function findOrCreateDirect(a: string, b: string): Conversation {
  const row = getDb()
    .prepare(
      `SELECT c.* FROM conversations c
         JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
         JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
        WHERE c.kind = 'direct'
          AND (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) = 2
        LIMIT 1`
    )
    .get(a, b) as Row | undefined;

  if (row) return toConversation(row);
  return createConversation({ kind: 'direct', title: '', memberIds: [a, b], createdBy: a });
}

export function addMembers(conversationId: string, userIds: string[]): void {
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`
  );
  for (const id of userIds) stmt.run(conversationId, id, nowIso());
}

export function removeMember(conversationId: string, userId: string): void {
  getDb()
    .prepare(`DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?`)
    .run(conversationId, userId);
}

export function memberIds(conversationId: string): string[] {
  const rows = getDb()
    .prepare(`SELECT user_id FROM conversation_members WHERE conversation_id = ?`)
    .all(conversationId) as Row[];
  return rows.map((r) => r.user_id);
}

/**
 * The inbox. `unread` counts messages after the member's watermark, excluding
 * their own — nobody has unread messages from themselves.
 */
export function listConversations(userId: string): ConversationSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*,
              cm.last_read_at,
              (SELECT body FROM messages m
                WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
                ORDER BY m.created_at DESC LIMIT 1) AS last_body,
              (SELECT created_at FROM messages m
                WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
                ORDER BY m.created_at DESC LIMIT 1) AS last_at,
              (SELECT COUNT(*) FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_id != ?
                  AND m.deleted_at IS NULL
                  AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)) AS unread
         FROM conversations c
         JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
        ORDER BY COALESCE(last_at, c.created_at) DESC`
    )
    .all(userId, userId) as Row[];

  return rows.map((r) => {
    const ids = memberIds(r.id);
    const names = ids.length
      ? (getDb()
          .prepare(
            `SELECT name FROM users WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY name`
          )
          .all(...(ids as any[])) as Row[]
        ).map((n) => n.name)
      : [];

    return {
      ...toConversation(r),
      memberIds: ids,
      memberNames: names,
      lastMessage: r.last_body ?? '',
      lastMessageAt: r.last_at ?? null,
      unread: Number(r.unread ?? 0),
    };
  });
}

export function listMessages(
  conversationId: string,
  opts: { limit?: number; before?: string } = {}
): Message[] {
  const where = ['conversation_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [conversationId];
  if (opts.before) {
    where.push('created_at < ?');
    values.push(opts.before);
  }
  values.push(opts.limit ?? 100);

  const rows = getDb()
    .prepare(
      `SELECT * FROM messages WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  // Query descending for the LIMIT, return ascending for rendering.
  return rows.map(toMessage).reverse();
}

export function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  attachments?: Attachment[];
  mentions?: string[];
}): Message {
  const id = crypto.randomUUID();
  const now = nowIso();
  const db = getDb();

  db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_id, body, attachments, mentions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.conversationId,
    input.senderId,
    input.body,
    JSON.stringify(input.attachments ?? []),
    JSON.stringify(input.mentions ?? []),
    now
  );

  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, input.conversationId);
  // The sender has by definition read their own message.
  markConversationRead(input.conversationId, input.senderId);

  const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Row;
  return toMessage(row);
}

export function markConversationRead(conversationId: string, userId: string): void {
  getDb()
    .prepare(
      `UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?`
    )
    .run(nowIso(), conversationId, userId);
}

/** Who has read up to when — the read-receipt row under a message thread. */
export function readReceipts(conversationId: string): { userId: string; name: string; lastReadAt: string | null }[] {
  const rows = getDb()
    .prepare(
      `SELECT cm.user_id, u.name, cm.last_read_at
         FROM conversation_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ?`
    )
    .all(conversationId) as Row[];
  return rows.map((r) => ({ userId: r.user_id, name: r.name, lastReadAt: r.last_read_at ?? null }));
}

export function softDeleteMessage(id: string, userId: string): void {
  // Scoped to the sender: nobody deletes someone else's message through here.
  getDb()
    .prepare(`UPDATE messages SET deleted_at = ? WHERE id = ? AND sender_id = ?`)
    .run(nowIso(), id, userId);
}

/** Full-text-ish search across the conversations a user actually belongs to. */
export function searchMessages(userId: string, query: string, limit = 50): (Message & { conversationTitle: string })[] {
  const rows = getDb()
    .prepare(
      `SELECT m.*, c.title AS conversation_title
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
        WHERE m.deleted_at IS NULL AND m.body LIKE ?
        ORDER BY m.created_at DESC LIMIT ?`
    )
    .all(userId, `%${query}%`, limit) as Row[];
  return rows.map((r) => ({ ...toMessage(r), conversationTitle: r.conversation_title }));
}

export function totalUnread(userId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n
         FROM messages m
         JOIN conversation_members cm
           ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
        WHERE m.sender_id != ?
          AND m.deleted_at IS NULL
          AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)`
    )
    .get(userId, userId) as { n: number };
  return Number(row.n);
}

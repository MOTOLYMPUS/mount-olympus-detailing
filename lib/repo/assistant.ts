// ─────────────────────────────────────────────────────────────────────────────
// AI assistant conversation history.
//
// Only persisted for signed-in users. An anonymous visitor's chat lives in the
// request/response cycle and nowhere else — storing it would mean holding
// identifiable questions ("how much to fix the scratch on my 2019 Tacoma")
// against no account and no consent.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, bool, getDb, nowIso } from '../db';
import { AssistantConversation, AssistantMessage } from '../models';

function toConversation(row: Row): AssistantConversation {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    title: row.title,
    escalated: bool(row.escalated),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: Row): AssistantMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    createdAt: row.created_at,
  };
}

export function createConversation(userId: string, title = 'New conversation'): AssistantConversation {
  const id = crypto.randomUUID();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO assistant_conversations (id, user_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, userId, title.slice(0, 120), now, now);
  return getConversation(id)!;
}

export function getConversation(id: string): AssistantConversation | null {
  const row = getDb().prepare(`SELECT * FROM assistant_conversations WHERE id = ?`).get(id) as
    | Row
    | undefined;
  return row ? toConversation(row) : null;
}

export function listConversations(userId: string, limit = 30): AssistantConversation[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM assistant_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`
    )
    .all(userId, limit) as Row[];
  return rows.map(toConversation);
}

export function listMessages(conversationId: string, limit = 100): AssistantMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM assistant_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`
    )
    .all(conversationId, limit) as Row[];
  return rows.map(toMessage);
}

export function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): AssistantMessage {
  const id = crypto.randomUUID();
  const now = nowIso();
  const db = getDb();

  db.prepare(
    `INSERT INTO assistant_messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, conversationId, role, content, now);

  db.prepare(`UPDATE assistant_conversations SET updated_at = ? WHERE id = ?`).run(
    now,
    conversationId
  );

  const row = db.prepare(`SELECT * FROM assistant_messages WHERE id = ?`).get(id) as Row;
  return toMessage(row);
}

/** First user message becomes the conversation title, so the list is scannable. */
export function setTitle(conversationId: string, title: string): void {
  getDb()
    .prepare(`UPDATE assistant_conversations SET title = ? WHERE id = ?`)
    .run(title.slice(0, 120), conversationId);
}

export function markEscalated(conversationId: string): void {
  getDb()
    .prepare(`UPDATE assistant_conversations SET escalated = 1, updated_at = ? WHERE id = ?`)
    .run(nowIso(), conversationId);
}

export function deleteConversation(id: string, userId: string): void {
  getDb()
    .prepare(`DELETE FROM assistant_conversations WHERE id = ? AND user_id = ?`)
    .run(id, userId);
}

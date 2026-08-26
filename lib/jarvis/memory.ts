// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — business memory.
//
// WHAT BELONGS HERE, AND WHAT DOES NOT.
//
// This table holds the things that have no other home: brand voice, SOPs,
// business goals, standing preferences, notes an agent inferred. It does NOT
// hold customers, vehicles, appointments, jobs, or revenue — those are real
// tables in lib/db.ts with real constraints, and agents read them through the
// tools in lib/jarvis/tools.ts. Copying them here would create a second,
// stale, unconstrained copy of the business.
//
// The rule of thumb: if it would still be true after every customer left, it
// is memory. If it is a fact about one customer, it belongs on that customer.
//
// RETRIEVAL is FTS5 (see schema.ts). Not embeddings: this corpus is hundreds of
// short documents written by one business, where keyword search is both better
// and free, and an embedding index would add a model dependency, a rebuild
// step, and a failure mode for no measurable gain at this size.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { ensureJarvisSchema } from './schema';

export const MEMORY_KINDS = [
  'brand', // voice, tone, words we use and avoid
  'goal', // business goals and targets
  'sop', // standard operating procedures
  'project', // ongoing initiatives
  'preference', // how the owner likes things done
  'campaign', // marketing campaigns, past and planned
  'insight', // something an agent worked out and should not re-derive
  'customer_note', // context about a customer that has no column
  'employee_note',
  'pricing_note',
  'fact', // anything else worth remembering
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export function isMemoryKind(v: unknown): v is MemoryKind {
  return typeof v === 'string' && (MEMORY_KINDS as readonly string[]).includes(v);
}

export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  tags: string[];
  entity: string;
  entityId: string | null;
  source: string;
  pinned: boolean;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryInput {
  id?: string;
  kind: MemoryKind;
  title: string;
  body?: string;
  tags?: string[];
  entity?: string;
  entityId?: string | null;
  source?: string;
  pinned?: boolean;
  /**
   * How sure we are. Owner-stated facts are 1.0; something an agent inferred
   * should be lower, so the dashboard can surface guesses for confirmation
   * instead of letting them harden into "what the business believes".
   */
  confidence?: number;
}

function toMemory(row: Row): Memory {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    tags: json<string[]>(row.tags, []),
    entity: row.entity,
    entityId: row.entity_id,
    source: row.source,
    pinned: row.pinned === 1,
    confidence: Number(row.confidence),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Write ────────────────────────────────────────────────────────────────────

export function remember(input: MemoryInput): Memory {
  ensureJarvisSchema();
  const db = getDb();
  const now = nowIso();

  if (input.id) {
    const existing = getMemory(input.id);
    if (existing) {
      db.prepare(
        `UPDATE jarvis_memory
            SET kind = ?, title = ?, body = ?, tags = ?, entity = ?, entity_id = ?,
                source = ?, pinned = ?, confidence = ?, updated_at = ?
          WHERE id = ?`
      ).run(
        input.kind,
        input.title.slice(0, 300),
        (input.body ?? '').slice(0, 20_000),
        JSON.stringify(input.tags ?? existing.tags),
        input.entity ?? existing.entity,
        input.entityId ?? existing.entityId,
        input.source ?? existing.source,
        input.pinned ?? existing.pinned ? 1 : 0,
        input.confidence ?? existing.confidence,
        now,
        input.id
      );
      return getMemory(input.id)!;
    }
  }

  const id = input.id ?? crypto.randomUUID();
  db.prepare(
    `INSERT INTO jarvis_memory
       (id, kind, title, body, tags, entity, entity_id, source, pinned, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.kind,
    input.title.slice(0, 300),
    (input.body ?? '').slice(0, 20_000),
    JSON.stringify(input.tags ?? []),
    input.entity ?? '',
    input.entityId ?? null,
    input.source ?? 'owner',
    input.pinned ? 1 : 0,
    input.confidence ?? 1.0,
    now,
    now
  );

  return getMemory(id)!;
}

export function forget(id: string): void {
  ensureJarvisSchema();
  getDb().prepare(`DELETE FROM jarvis_memory WHERE id = ?`).run(id);
}

export function setPinned(id: string, pinned: boolean): void {
  ensureJarvisSchema();
  getDb()
    .prepare(`UPDATE jarvis_memory SET pinned = ?, updated_at = ? WHERE id = ?`)
    .run(pinned ? 1 : 0, nowIso(), id);
}

// ── Read ─────────────────────────────────────────────────────────────────────

export function getMemory(id: string): Memory | null {
  ensureJarvisSchema();
  const row = getDb().prepare(`SELECT * FROM jarvis_memory WHERE id = ?`).get(id) as Row | undefined;
  return row ? toMemory(row) : null;
}

/**
 * FTS5 treats a bare user string as query *syntax* — an unbalanced quote or a
 * stray `NEAR` is a SQL-level error, and "5-star" parses as an operator. Every
 * term is therefore extracted and re-quoted as a literal phrase. The cost is
 * losing FTS operators the owner was never going to type; the gain is that no
 * spoken sentence can crash search.
 */
function toMatchQuery(raw: string): string {
  const terms = raw
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1)
    .slice(0, 12);
  if (!terms.length) return '';
  // OR rather than AND: recall matters more than precision when the results are
  // re-read by a model that can ignore an irrelevant hit.
  return terms.map((t) => `"${t}"*`).join(' OR ');
}

export interface SearchOptions {
  kind?: MemoryKind;
  entityId?: string;
  limit?: number;
}

export function searchMemory(query: string, opts: SearchOptions = {}): Memory[] {
  ensureJarvisSchema();
  const limit = Math.min(opts.limit ?? 10, 50);
  const match = toMatchQuery(query);

  // No usable terms — fall back to most-recently-updated rather than nothing,
  // so a vague question still gets context.
  if (!match) return recentMemory({ kind: opts.kind, limit });

  const where: string[] = [];
  const values: unknown[] = [match];
  if (opts.kind) {
    where.push('m.kind = ?');
    values.push(opts.kind);
  }
  if (opts.entityId) {
    where.push('m.entity_id = ?');
    values.push(opts.entityId);
  }
  values.push(limit);

  try {
    const rows = getDb()
      .prepare(
        `SELECT m.*
           FROM jarvis_memory_fts f
           JOIN jarvis_memory m ON m.rowid = f.rowid
          WHERE jarvis_memory_fts MATCH ?
            ${where.length ? `AND ${where.join(' AND ')}` : ''}
          ORDER BY bm25(jarvis_memory_fts, 3.0, 1.0, 2.0), m.updated_at DESC
          LIMIT ?`
      )
      .all(...(values as any[])) as Row[];
    return rows.map(toMemory);
  } catch (e) {
    // A corrupt or missing FTS index must degrade to LIKE, not to a 500 on the
    // dashboard. Rare, but the failure is invisible until someone searches.
    console.error('[jarvis] FTS search failed, falling back to LIKE', e);
    return likeSearch(query, opts, limit);
  }
}

function likeSearch(query: string, opts: SearchOptions, limit: number): Memory[] {
  const like = `%${query.replace(/[%_]/g, '')}%`;
  const where = ['(title LIKE ? OR body LIKE ?)'];
  const values: unknown[] = [like, like];
  if (opts.kind) {
    where.push('kind = ?');
    values.push(opts.kind);
  }
  values.push(limit);

  const rows = getDb()
    .prepare(
      `SELECT * FROM jarvis_memory WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  return rows.map(toMemory);
}

export function recentMemory(opts: { kind?: MemoryKind; limit?: number } = {}): Memory[] {
  ensureJarvisSchema();
  const limit = Math.min(opts.limit ?? 20, 200);
  const rows = opts.kind
    ? (getDb()
        .prepare(`SELECT * FROM jarvis_memory WHERE kind = ? ORDER BY updated_at DESC LIMIT ?`)
        .all(opts.kind, limit) as Row[])
    : (getDb()
        .prepare(`SELECT * FROM jarvis_memory ORDER BY updated_at DESC LIMIT ?`)
        .all(limit) as Row[]);
  return rows.map(toMemory);
}

/**
 * The memories injected into every agent's system prompt.
 *
 * Capped hard. Pinning is how the owner says "this always matters", and an
 * uncapped list would grow until it crowded out the actual task — the failure
 * would look like the agents getting vaguer over months, which is very hard to
 * diagnose after the fact.
 */
const MAX_PINNED = 25;

export function pinnedMemory(): Memory[] {
  ensureJarvisSchema();
  const rows = getDb()
    .prepare(`SELECT * FROM jarvis_memory WHERE pinned = 1 ORDER BY kind, updated_at DESC LIMIT ?`)
    .all(MAX_PINNED) as Row[];
  return rows.map(toMemory);
}

export function memoryForEntity(entityId: string, limit = 20): Memory[] {
  ensureJarvisSchema();
  const rows = getDb()
    .prepare(`SELECT * FROM jarvis_memory WHERE entity_id = ? ORDER BY updated_at DESC LIMIT ?`)
    .all(entityId, limit) as Row[];
  return rows.map(toMemory);
}

export function memoryCounts(): Record<string, number> {
  ensureJarvisSchema();
  const rows = getDb()
    .prepare(`SELECT kind, COUNT(*) AS n FROM jarvis_memory GROUP BY kind`)
    .all() as Row[];
  return Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)]));
}

// ── Prompt rendering ─────────────────────────────────────────────────────────

/** Compact, token-cheap rendering used by both the agent runtime and voice. */
export function renderMemories(memories: Memory[]): string {
  if (!memories.length) return '';
  return memories
    .map((m) => {
      const flag = m.confidence < 0.8 ? ' (unconfirmed)' : '';
      const body = m.body ? `\n  ${m.body.replace(/\n+/g, '\n  ')}` : '';
      return `- [${m.kind}] ${m.title}${flag}${body}`;
    })
    .join('\n');
}

// ── First-run seed ───────────────────────────────────────────────────────────

/**
 * Placeholders, deliberately marked `confidence: 0.5` and sourced to 'system'.
 * They exist so the dashboard is not empty and the agents are not styleless on
 * day one — and so the owner sees, in the memory list, exactly which beliefs
 * are guesses waiting to be corrected.
 */
export function seedStarterMemory(): number {
  ensureJarvisSchema();
  const existing = getDb().prepare(`SELECT COUNT(*) AS n FROM jarvis_memory`).get() as { n: number };
  if (Number(existing.n) > 0) return 0;

  const seeds: MemoryInput[] = [
    {
      kind: 'brand',
      title: 'Brand voice',
      body: 'Confident, plain-spoken, never hype. We explain what a service does and what it costs. No exclamation marks, no "amazing", no emoji in customer email. Say "detail", not "car wash".',
      pinned: true,
      source: 'system',
      confidence: 0.5,
      tags: ['voice', 'writing'],
    },
    {
      kind: 'brand',
      title: 'What we sell',
      body: 'Mount Olympus Detailing — mobile and shop detailing for automotive, marine, aviation, and motorcycle. Pricing and service definitions live in data/pricing; never quote a price from memory, always read the price tables.',
      pinned: true,
      source: 'system',
      confidence: 0.5,
    },
    {
      kind: 'preference',
      title: 'Nothing goes out without approval',
      body: 'Customer messages, marketing, social posts, and site changes are drafted and queued for the owner. Do not assume permission to publish.',
      pinned: true,
      source: 'system',
      confidence: 1.0,
    },
    {
      kind: 'goal',
      title: 'Business goals — needs owner input',
      body: 'Placeholder. Ask the owner for revenue targets, the services to push, and the service area to grow into, then replace this memory.',
      pinned: true,
      source: 'system',
      confidence: 0.3,
    },
  ];

  for (const seed of seeds) remember(seed);
  return seeds.length;
}

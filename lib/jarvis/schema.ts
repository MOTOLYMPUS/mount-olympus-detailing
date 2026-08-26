// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — persistence.
//
// Jarvis stores its state in the SAME SQLite database as the rest of the app
// (lib/db.ts). That is deliberate: an agent that recommends a promotion needs
// to read revenue, and an agent that drafts a reminder needs the appointment.
// A second database would mean cross-database joins, two backup stories, and
// two chances to be out of sync.
//
// The schema is applied lazily on first use rather than from lib/db.ts's own
// boot path, so that a build which never touches Jarvis never creates its
// tables. Like lib/db.ts, every statement is CREATE ... IF NOT EXISTS, so
// running it against an existing database is a no-op.
//
// TABLE OWNERSHIP
//   jarvis_tasks        — the task queue. The orchestrator's entire world.
//   jarvis_events       — append-only log lines emitted by agents and the queue.
//   jarvis_memory       — business memory. Mirrored into an FTS5 index.
//   jarvis_approvals    — anything an agent wants to do that needs a human yes.
//   jarvis_agent_state  — per-agent health, used by the supervisor.
//   jarvis_voice        — voice turns: what was heard, what was done, what was said.
//   jarvis_secrets      — encrypted third-party credentials (see lib/jarvis/vault.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db';

const SCHEMA = `
-- ── Task queue ──────────────────────────────────────────────────────────────
--
-- One row per unit of agent work. Agents never call each other directly; they
-- enqueue tasks here and the orchestrator decides what runs. That indirection
-- is what makes a new agent a config change rather than a redesign.
CREATE TABLE IF NOT EXISTS jarvis_tasks (
  id           TEXT PRIMARY KEY,
  parent_id    TEXT REFERENCES jarvis_tasks(id) ON DELETE SET NULL,
  agent        TEXT NOT NULL,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  input        TEXT NOT NULL DEFAULT '{}',

  -- queued | running | waiting_approval | done | failed | cancelled
  status       TEXT NOT NULL DEFAULT 'queued',

  -- Higher runs first. 0 = routine, 50 = owner asked out loud, 100 = incident.
  priority     INTEGER NOT NULL DEFAULT 0,

  -- Set by the caller to mean "there is no point running this twice today".
  -- Enforced by a partial unique index below, NOT by an application check —
  -- two orchestrator ticks racing would both pass an application check.
  dedupe_key   TEXT,

  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,

  -- Nothing is claimed before this instant. Backs both scheduling ("run at 7am")
  -- and retry backoff ("try again in 4 minutes").
  run_after    TEXT NOT NULL,

  -- Set when a worker claims the row; cleared on completion. A row that is
  -- 'running' with a stale lease is reaped — see reclaimStalled().
  lease_until  TEXT,

  result       TEXT,
  error        TEXT,
  cost_tokens  INTEGER NOT NULL DEFAULT 0,
  duration_ms  INTEGER,

  created_by   TEXT,
  started_at   TEXT,
  finished_at  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- The claim query. Ordering matches it exactly so SQLite can walk the index.
CREATE INDEX IF NOT EXISTS idx_jtasks_claim
  ON jarvis_tasks (status, run_after, priority DESC);
CREATE INDEX IF NOT EXISTS idx_jtasks_agent
  ON jarvis_tasks (agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jtasks_parent ON jarvis_tasks (parent_id);

-- "Prevent duplicate work", enforced by the database.
--
-- Scoped to rows that are still live: once a task is done or failed, the same
-- dedupe key must be enqueueable again tomorrow. Without the WHERE clause a
-- daily digest could only ever run once, for all time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jtasks_dedupe
  ON jarvis_tasks (dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status IN ('queued', 'running', 'waiting_approval');

-- ── Agent + queue logs ──────────────────────────────────────────────────────
--
-- Append-only, same convention as audit_log: no update, no delete.
CREATE TABLE IF NOT EXISTS jarvis_events (
  id         TEXT PRIMARY KEY,
  task_id    TEXT REFERENCES jarvis_tasks(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL DEFAULT 'info',   -- debug | info | warn | error
  message    TEXT NOT NULL,
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jevents_task    ON jarvis_events (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jevents_created ON jarvis_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jevents_level   ON jarvis_events (level, created_at DESC);

-- ── Business memory ─────────────────────────────────────────────────────────
--
-- Deliberately schemaless in the body: a brand guideline, an SOP, and a note
-- about a customer's black F-250 are all "things Jarvis should remember", and
-- forcing them into typed columns would mean a migration per new memory type.
-- Structured business records (customers, jobs, revenue) are NOT copied here —
-- they live in their real tables and agents read them through tools.
CREATE TABLE IF NOT EXISTS jarvis_memory (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,                  -- see MEMORY_KINDS in memory.ts
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  tags       TEXT NOT NULL DEFAULT '[]',

  -- Optional link to a real row elsewhere (a user id, an appointment id).
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT,

  -- Who wrote it: 'owner' | 'voice' | an agent name. Lets the UI show — and the
  -- owner correct — anything an agent inferred rather than was told.
  source     TEXT NOT NULL DEFAULT 'owner',

  -- Pinned memories are injected into EVERY agent's context (brand voice,
  -- business goals). Unpinned ones are only found by search. This is the main
  -- control on prompt size, so pinning is intentionally a deliberate act.
  pinned     INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 1.0,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jmem_kind   ON jarvis_memory (kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jmem_pinned ON jarvis_memory (pinned) WHERE pinned = 1;
CREATE INDEX IF NOT EXISTS idx_jmem_entity ON jarvis_memory (entity, entity_id);

-- Full-text index. 'contentless-delete' would be leaner, but a plain external
-- content table keeps the triggers below trivial to reason about.
CREATE VIRTUAL TABLE IF NOT EXISTS jarvis_memory_fts USING fts5(
  title, body, tags,
  content = 'jarvis_memory',
  content_rowid = 'rowid',
  tokenize = 'porter unicode61'
);

-- Triggers, not application code, keep the index in step: a repository function
-- that forgot to reindex would leave memories silently unsearchable.
CREATE TRIGGER IF NOT EXISTS jmem_ai AFTER INSERT ON jarvis_memory BEGIN
  INSERT INTO jarvis_memory_fts (rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS jmem_ad AFTER DELETE ON jarvis_memory BEGIN
  INSERT INTO jarvis_memory_fts (jarvis_memory_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS jmem_au AFTER UPDATE ON jarvis_memory BEGIN
  INSERT INTO jarvis_memory_fts (jarvis_memory_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
  INSERT INTO jarvis_memory_fts (rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;

-- ── Approvals ───────────────────────────────────────────────────────────────
--
-- The safety spine. An agent cannot send an email, publish a post, or edit the
-- site directly; it writes a row here and stops. The payload is the *exact*
-- arguments the connector will later be called with, so what the owner reads in
-- the dashboard is what actually goes out — not a summary of it.
CREATE TABLE IF NOT EXISTS jarvis_approvals (
  id          TEXT PRIMARY KEY,
  task_id     TEXT REFERENCES jarvis_tasks(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,

  -- The connector + method that will run on approval, e.g. 'email'/'send'.
  channel     TEXT NOT NULL,
  action      TEXT NOT NULL,

  summary     TEXT NOT NULL DEFAULT '',
  payload     TEXT NOT NULL DEFAULT '{}',
  risk        TEXT NOT NULL DEFAULT 'medium',   -- low | medium | high

  -- pending | approved | rejected | executed | failed | expired
  status      TEXT NOT NULL DEFAULT 'pending',

  decided_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at  TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  executed_at TEXT,
  result      TEXT,
  expires_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_japprovals_status ON jarvis_approvals (status, created_at DESC);

-- ── Agent health ────────────────────────────────────────────────────────────
--
-- One row per registered agent. The supervisor reads this to decide what is
-- broken; the owner toggles enabled to stop an agent without a deploy.
CREATE TABLE IF NOT EXISTS jarvis_agent_state (
  agent                TEXT PRIMARY KEY,
  enabled              INTEGER NOT NULL DEFAULT 1,
  last_run_at          TEXT,
  last_success_at      TEXT,
  last_error           TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  runs_total           INTEGER NOT NULL DEFAULT 0,
  failures_total       INTEGER NOT NULL DEFAULT 0,
  tokens_total         INTEGER NOT NULL DEFAULT 0,
  updated_at           TEXT NOT NULL
);

-- ── Voice turns ─────────────────────────────────────────────────────────────
--
-- Kept because "what did I ask Jarvis to do last Tuesday" is a real question,
-- and because a misrouted intent is only debuggable with the raw transcript.
-- Audio is never stored — only text.
CREATE TABLE IF NOT EXISTS jarvis_voice (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  transcript  TEXT NOT NULL,
  intent      TEXT NOT NULL DEFAULT '',
  agent       TEXT NOT NULL DEFAULT '',
  task_id     TEXT REFERENCES jarvis_tasks(id) ON DELETE SET NULL,
  reply       TEXT NOT NULL DEFAULT '',
  confidence  REAL,
  duration_ms INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jvoice_created ON jarvis_voice (created_at DESC);

-- ── Encrypted secrets ───────────────────────────────────────────────────────
--
-- Third-party credentials added at runtime through the dashboard, so the owner
-- can connect Google Calendar without editing .env and restarting. Ciphertext
-- only; the key never lives in this table. See lib/jarvis/vault.ts.
CREATE TABLE IF NOT EXISTS jarvis_secrets (
  name       TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv         TEXT NOT NULL,
  tag        TEXT NOT NULL,
  hint       TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
`;

let applied = false;

/**
 * Idempotent. Every Jarvis repository calls this before its first query rather
 * than relying on import order — a module that is tree-shaken or lazily
 * imported must not be able to observe a half-created schema.
 */
export function ensureJarvisSchema(): void {
  if (applied) return;
  getDb().exec(SCHEMA);
  applied = true;
}

/** Test/script hook: forget that the schema was applied on this connection. */
export function resetSchemaCache(): void {
  applied = false;
}

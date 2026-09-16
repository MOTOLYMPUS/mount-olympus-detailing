// ─────────────────────────────────────────────────────────────────────────────
// Persistence — SQLite via Node's built-in `node:sqlite` module.
//
// Chosen so the app is fully functional with zero external accounts AND zero
// native compilation. (`better-sqlite3` was tried first; it has no prebuilt
// binary for Node 24 and falls back to a source build requiring Python + MSVC.)
//
// ⚠️  REQUIRES NODE >= 22.5. Enforced by the `engines` field in package.json.
//
// ⚠️  DEPLOYMENT: serverless hosts (Vercel, Netlify) have an ephemeral, often
// read-only filesystem — the database WILL be lost between invocations there.
// Before deploying to one, swap this module for Postgres.
//
// STRUCTURE
//   • This file owns the connection, the schema, and the seed data.
//   • Every other table is read/written through a repository in lib/repo/*.ts.
//     Nothing outside lib/db.ts and lib/repo/* contains SQL, so a Postgres
//     port is confined to those files.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { EstimateRequestRecord } from './types';

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data.sqlite');

let instance: DatabaseSync | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Schema
//
// Written as one idempotent script rather than versioned migration files:
// every statement is CREATE ... IF NOT EXISTS, so running it against an
// existing database is a no-op and boot is self-healing.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = `
-- ── Estimate requests (pre-existing; unchanged) ─────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_requests (
  id                   TEXT PRIMARY KEY,
  reference            TEXT NOT NULL UNIQUE,
  created_at           TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'new',

  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT NOT NULL,
  sms_consent          INTEGER NOT NULL DEFAULT 0,

  industry             TEXT NOT NULL,
  vehicle_type         TEXT NOT NULL,
  make                 TEXT NOT NULL,
  model                TEXT NOT NULL,
  year                 TEXT NOT NULL,
  size_class           TEXT NOT NULL,

  service_ids          TEXT NOT NULL,
  addon_ids            TEXT NOT NULL,

  quoted_total         INTEGER NOT NULL,
  quoted_total_max     INTEGER NOT NULL,
  estimated_hours      REAL NOT NULL,
  is_placeholder_price INTEGER NOT NULL DEFAULT 0,

  preferred_date       TEXT,
  notes                TEXT NOT NULL DEFAULT '',

  ip_hash              TEXT,
  notify_email_status  TEXT NOT NULL DEFAULT 'pending',
  notify_sms_status    TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_estimate_created ON estimate_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimate_status  ON estimate_requests (status);
CREATE INDEX IF NOT EXISTS idx_estimate_ip      ON estimate_requests (ip_hash, created_at);

-- ── Identity ────────────────────────────────────────────────────────────────
-- One table for customers, employees, managers and owners. Role drives every
-- authorisation decision; see lib/rbac.ts.
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,   -- always stored lowercased
  password_hash  TEXT NOT NULL,          -- scrypt, see lib/auth.ts
  role           TEXT NOT NULL DEFAULT 'customer',
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL DEFAULT '',
  sms_consent    INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  address        TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  hourly_rate    INTEGER,                -- cents; employees only
  hired_at       TEXT,
  deactivated_at TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  last_login_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role, active);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,  -- sha256; the raw token only lives in the cookie
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_hash    TEXT,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

-- ── Vehicle garage ──────────────────────────────────────────────────────────
-- Covers all three industries: a boat, a helicopter and a pickup are the same
-- row shape, discriminated by industry + size_class (see lib/types.ts).
CREATE TABLE IF NOT EXISTS vehicles (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  industry     TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  size_class   TEXT NOT NULL,
  year         TEXT NOT NULL DEFAULT '',
  make         TEXT NOT NULL DEFAULT '',
  model        TEXT NOT NULL DEFAULT '',
  trim         TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '',
  vin          TEXT NOT NULL DEFAULT '',
  plate        TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  photo_url    TEXT,
  is_default   INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles (user_id, archived);

-- ── Appointments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id               TEXT PRIMARY KEY,
  reference        TEXT NOT NULL UNIQUE,
  customer_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id       TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  employee_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  estimate_id      TEXT,                    -- source estimate, when converted

  industry         TEXT NOT NULL,
  size_class       TEXT NOT NULL,
  service_ids      TEXT NOT NULL DEFAULT '[]',
  addon_ids        TEXT NOT NULL DEFAULT '[]',

  location_type    TEXT NOT NULL DEFAULT 'mobile',   -- mobile | shop
  address          TEXT NOT NULL DEFAULT '',
  service_area_id  TEXT,

  starts_at        TEXT NOT NULL,           -- ISO 8601 UTC
  ends_at          TEXT NOT NULL,
  travel_minutes   INTEGER NOT NULL DEFAULT 0,
  buffer_minutes   INTEGER NOT NULL DEFAULT 0,

  quoted_total     INTEGER NOT NULL DEFAULT 0,
  quoted_total_max INTEGER NOT NULL DEFAULT 0,
  estimated_hours  REAL NOT NULL DEFAULT 0,
  deposit_cents    INTEGER NOT NULL DEFAULT 0,
  paid_cents       INTEGER NOT NULL DEFAULT 0,

  status           TEXT NOT NULL DEFAULT 'scheduled',
  notes            TEXT NOT NULL DEFAULT '',
  photo_urls       TEXT NOT NULL DEFAULT '[]',
  cancel_reason    TEXT,
  cancelled_at     TEXT,
  reminded_at      TEXT,
  source           TEXT NOT NULL DEFAULT 'app',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_customer ON appointments (customer_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_appt_employee ON appointments (employee_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appt_window   ON appointments (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_appt_status   ON appointments (status, starts_at);

-- ── Job execution (the employee-side record of an appointment) ──────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                TEXT PRIMARY KEY,
  appointment_id    TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  employee_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'assigned',
  started_at        TEXT,
  completed_at      TEXT,
  paused_at         TEXT,
  paused_ms         INTEGER NOT NULL DEFAULT 0,   -- accumulated pause time
  duration_minutes  INTEGER,
  checklist         TEXT NOT NULL DEFAULT '[]',   -- [{id,label,done}]
  materials         TEXT NOT NULL DEFAULT '[]',   -- [{name,qty,unit,costCents}]
  completion_notes  TEXT NOT NULL DEFAULT '',
  signature_data    TEXT,                          -- data: URL of customer signature
  signed_by         TEXT NOT NULL DEFAULT '',
  signed_at         TEXT,
  customer_rating   INTEGER,                       -- 1-5
  customer_feedback TEXT NOT NULL DEFAULT '',
  revenue_cents     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_employee ON jobs (employee_id, status);

CREATE TABLE IF NOT EXISTS job_photos (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,          -- before | after | progress
  url         TEXT NOT NULL,
  caption     TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos (job_id, kind);

-- ── Scheduling configuration ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_schedules (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL,   -- 0 = Sunday
  start_min   INTEGER NOT NULL,   -- minutes from local midnight
  end_min     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sched_emp ON employee_schedules (employee_id, weekday);

CREATE TABLE IF NOT EXISTS time_off (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'approved',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeoff_emp ON time_off (employee_id, starts_at);

CREATE TABLE IF NOT EXISTS holidays (
  id     TEXT PRIMARY KEY,
  date   TEXT NOT NULL UNIQUE,   -- YYYY-MM-DD, local
  label  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS service_areas (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  postal_codes    TEXT NOT NULL DEFAULT '[]',
  travel_minutes  INTEGER NOT NULL DEFAULT 30,
  surcharge_cents INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1
);

-- ── Key/value application settings (business hours, buffers, toggles) ───────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,       -- JSON
  updated_at TEXT NOT NULL
);

-- ── Loyalty & memberships ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  points          INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  tier            TEXT NOT NULL DEFAULT 'bronze',
  referral_code   TEXT NOT NULL UNIQUE,
  referred_by     TEXT,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loyalty_events (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,   -- earn|redeem|referral|adjustment|expiry
  points         INTEGER NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  appointment_id TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loyalty_user ON loyalty_events (user_id, created_at DESC);

-- ONE-TIME percentage-off coupons. They never expire. Two kinds:
--   tier      granted the moment a customer's lifetime points reach a tier
--             (silver/gold/platinum) — the tier's reward is this coupon, not a
--             standing discount.
--   referral  when someone signs up with a referral code, two rows: the NEW
--             customer's coupon (available at once) and the REFERRER's coupon
--             (pending until the new customer adds a vehicle or books — an
--             account that never does either earns the referrer nothing).
-- The best available coupon is spent by the customer's next booking and
-- released again if that booking is cancelled.
CREATE TABLE IF NOT EXISTS coupons (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- who gets the discount
  kind           TEXT NOT NULL,   -- tier|referral
  percent        INTEGER NOT NULL,
  status         TEXT NOT NULL,   -- pending|available|used
  tier           TEXT,            -- tier coupons: which tier earned it
  other_user_id  TEXT,            -- referral coupons: the other party
  role           TEXT,            -- referral coupons: referrer|referee
  appointment_id TEXT,
  created_at     TEXT NOT NULL,
  unlocked_at    TEXT,
  used_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_coupons_user ON coupons (user_id, status);
CREATE INDEX IF NOT EXISTS idx_coupons_other ON coupons (other_user_id, role, status);

CREATE TABLE IF NOT EXISTS membership_plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price_cents   INTEGER NOT NULL,
  interval      TEXT NOT NULL DEFAULT 'month',
  discount_pct  INTEGER NOT NULL DEFAULT 0,
  included      TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS memberships (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id      TEXT NOT NULL REFERENCES membership_plans(id),
  status       TEXT NOT NULL DEFAULT 'active',
  started_at   TEXT NOT NULL,
  renews_at    TEXT,
  cancelled_at TEXT,
  provider_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships (user_id, status);

-- ── Commerce ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id             TEXT PRIMARY KEY,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL,     -- deposit|balance|tip|refund|membership
  amount_cents   INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  provider       TEXT NOT NULL DEFAULT 'stripe',
  provider_ref   TEXT,
  method_label   TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_appt ON payments (appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lines          TEXT NOT NULL DEFAULT '[]',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents      INTEGER NOT NULL DEFAULT 0,
  tip_cents      INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft|sent|paid|void
  issued_at      TEXT,
  paid_at        TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gift_cards (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  initial_cents INTEGER NOT NULL,
  balance_cents INTEGER NOT NULL,
  issued_to     TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotions (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'percent',  -- percent|amount
  value      INTEGER NOT NULL,
  starts_at  TEXT,
  ends_at    TEXT,
  max_uses   INTEGER,
  uses       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- ── Team messaging ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'group',  -- direct|group|announcement|job
  title      TEXT NOT NULL DEFAULT '',
  job_id     TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TEXT NOT NULL,
  last_read_at    TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  body            TEXT NOT NULL DEFAULT '',
  attachments     TEXT NOT NULL DEFAULT '[]',
  mentions        TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  edited_at       TEXT,
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, created_at DESC);

-- ── Notifications & push ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  failed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  url        TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, created_at DESC);

-- ── AI assistant ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New conversation',
  escalated  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,     -- user | assistant
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_msgs ON assistant_messages (conversation_id, created_at);

-- ── Audit log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT,
  actor_role TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT,
  meta       TEXT NOT NULL DEFAULT '{}',
  ip_hash    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log (actor_id, created_at DESC);

-- ── Generic rate limiting (auth attempts, AI calls, uploads) ────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT NOT NULL,
  subject    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ratelimit ON rate_limits (bucket, subject, created_at);

-- ── Business expenses (owner bookkeeping, admin-only) ───────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  spent_on     TEXT NOT NULL,               -- YYYY-MM-DD, the date of spend
  category     TEXT NOT NULL DEFAULT 'other',
  amount_cents INTEGER NOT NULL,
  vendor       TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  deductible   INTEGER NOT NULL DEFAULT 1,
  receipt_key  TEXT,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (spent_on DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_cat  ON expenses (category, spent_on DESC);
`;

function connect(): DatabaseSync {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  // WAL keeps reads from blocking the write that follows a submission.
  db.exec(`PRAGMA journal_mode = WAL;`);
  db.exec(`PRAGMA foreign_keys = ON;`);

  db.exec(SCHEMA);
  seedDefaults(db);

  instance = db;
  return db;
}

/**
 * Rows the application assumes exist. Inserted with OR IGNORE so an operator
 * who edits them is never overwritten on the next boot.
 */
function seedDefaults(db: DatabaseSync) {
  const now = new Date().toISOString();

  // Business hours mirror lib/business.ts. Minutes from local midnight;
  // `null` means closed that day.
  const weekday = { start: 8 * 60, end: 19 * 60 };
  const defaults: [string, unknown][] = [
    [
      'business_hours',
      {
        '0': null, // Sunday — closed
        '1': weekday,
        '2': weekday,
        '3': weekday,
        '4': weekday,
        '5': weekday,
        '6': { start: 8 * 60, end: 17 * 60 }, // Saturday
      },
    ],
    ['slot_interval_minutes', 30],
    ['buffer_minutes', 30],
    ['default_travel_minutes', 30],
    ['min_notice_hours', 12],
    ['max_advance_days', 90],
    ['cancellation_notice_hours', 24],
    ['deposit_percent', 0],
    ['timezone', 'America/Chicago'],
    ['loyalty_points_per_dollar', 1],
    ['loyalty_points_per_dollar_redeemed', 100],
  ];

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`
  );
  for (const [key, value] of defaults) stmt.run(key, JSON.stringify(value), now);
}

/** Exposed for repositories, tests, and the health check. */
export function getDb(): DatabaseSync {
  return connect();
}

/** Close the handle — used by scripts so the process can exit cleanly. */
export function closeDb(): void {
  instance?.close();
  instance = null;
}

export type Row = Record<string, any>;

export const nowIso = (): string => new Date().toISOString();

/** SQLite has no boolean type; every flag round-trips through 0/1. */
export const bool = (v: unknown): boolean => v === 1 || v === true;
export const flag = (v: boolean | undefined | null): number => (v ? 1 : 0);

/** Parse a JSON column, falling back rather than throwing on corrupt data. */
export function json<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estimate requests — unchanged public surface, still used by
// app/api/estimates/route.ts and the marketing site.
// ─────────────────────────────────────────────────────────────────────────────

function toRecord(row: Row): EstimateRequestRecord {
  return {
    id: row.id,
    reference: row.reference,
    createdAt: row.created_at,
    status: row.status,
    name: row.name,
    email: row.email,
    phone: row.phone,
    smsConsent: !!row.sms_consent,
    industry: row.industry,
    vehicleType: row.vehicle_type,
    make: row.make,
    model: row.model,
    year: row.year,
    sizeClass: row.size_class,
    serviceIds: json<string[]>(row.service_ids, []),
    addOnIds: json<string[]>(row.addon_ids, []),
    quotedTotal: row.quoted_total,
    quotedTotalMax: row.quoted_total_max,
    estimatedHours: row.estimated_hours,
    isPlaceholderPricing: !!row.is_placeholder_price,
    preferredDate: row.preferred_date,
    notes: row.notes,
  };
}

export function insertEstimateRequest(
  record: EstimateRequestRecord,
  ipHash: string | null
): EstimateRequestRecord {
  const db = connect();
  db.prepare(
    `INSERT INTO estimate_requests (
       id, reference, created_at, status,
       name, email, phone, sms_consent,
       industry, vehicle_type, make, model, year, size_class,
       service_ids, addon_ids,
       quoted_total, quoted_total_max, estimated_hours, is_placeholder_price,
       preferred_date, notes, ip_hash
     ) VALUES (
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?,
       ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?
     )`
  ).run(
    record.id,
    record.reference,
    record.createdAt,
    record.status,
    record.name,
    record.email,
    record.phone,
    record.smsConsent ? 1 : 0,
    record.industry,
    record.vehicleType,
    record.make,
    record.model,
    record.year,
    record.sizeClass,
    JSON.stringify(record.serviceIds),
    JSON.stringify(record.addOnIds),
    record.quotedTotal,
    record.quotedTotalMax,
    record.estimatedHours,
    record.isPlaceholderPricing ? 1 : 0,
    record.preferredDate,
    record.notes,
    ipHash
  );

  return record;
}

export function updateNotificationStatus(
  id: string,
  channel: 'email' | 'sms',
  status: string
): void {
  const column = channel === 'email' ? 'notify_email_status' : 'notify_sms_status';
  connect().prepare(`UPDATE estimate_requests SET ${column} = ? WHERE id = ?`).run(status, id);
}

export function listEstimateRequests(limit = 100): EstimateRequestRecord[] {
  const rows = connect()
    .prepare(`SELECT * FROM estimate_requests ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as Row[];
  return rows.map(toRecord);
}

export function getEstimateRequest(id: string): EstimateRequestRecord | null {
  const row = connect().prepare(`SELECT * FROM estimate_requests WHERE id = ?`).get(id) as
    | Row
    | undefined;
  return row ? toRecord(row) : null;
}

/**
 * Estimates raised against a customer's email address. This is how a quote
 * requested from the public site — before the customer had an account — shows
 * up in their dashboard once they register with the same address.
 */
export function listEstimateRequestsByEmail(email: string, limit = 50): EstimateRequestRecord[] {
  const rows = connect()
    .prepare(`SELECT * FROM estimate_requests WHERE email = ? ORDER BY created_at DESC LIMIT ?`)
    .all(email.toLowerCase(), limit) as Row[];
  return rows.map(toRecord);
}

export function setEstimateStatus(id: string, status: string): void {
  connect().prepare(`UPDATE estimate_requests SET status = ? WHERE id = ?`).run(status, id);
}

/** Submissions from one IP inside the window — backs the rate limiter. */
export function countRecentByIp(ipHash: string, sinceIso: string): number {
  const row = connect()
    .prepare(`SELECT COUNT(*) AS n FROM estimate_requests WHERE ip_hash = ? AND created_at >= ?`)
    .get(ipHash, sinceIso) as { n: number };
  return Number(row.n);
}

/**
 * Dates that already hold a confirmed job. Retained for the marketing-site
 * estimate flow; the app's real scheduler is lib/availability.ts, which reads
 * the `appointments` table instead.
 */
export function scheduledDates(): string[] {
  const rows = connect()
    .prepare(
      `SELECT DISTINCT preferred_date FROM estimate_requests
       WHERE preferred_date IS NOT NULL AND status = 'scheduled'`
    )
    .all() as Row[];
  return rows.map((r) => r.preferred_date);
}

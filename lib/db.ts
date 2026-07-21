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
// Before deploying to one, swap this module for Postgres. Every caller goes
// through the exported functions below, so the surface to reimplement is small
// and nothing else in the codebase touches SQL.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { EstimateRequestRecord } from './types';

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data.sqlite');

let instance: DatabaseSync | null = null;

function connect(): DatabaseSync {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  // WAL keeps reads from blocking the write that follows a submission.
  db.exec(`PRAGMA journal_mode = WAL;`);
  db.exec(`PRAGMA foreign_keys = ON;`);

  db.exec(`
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
  `);

  instance = db;
  return db;
}

/** Exposed for tests and the health check. */
export function getDb(): DatabaseSync {
  return connect();
}

type Row = Record<string, any>;

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
    serviceIds: JSON.parse(row.service_ids),
    addOnIds: JSON.parse(row.addon_ids),
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

/** Submissions from one IP inside the window — backs the rate limiter. */
export function countRecentByIp(ipHash: string, sinceIso: string): number {
  const row = connect()
    .prepare(`SELECT COUNT(*) AS n FROM estimate_requests WHERE ip_hash = ? AND created_at >= ?`)
    .get(ipHash, sinceIso) as { n: number };
  return Number(row.n);
}

/**
 * Dates that already hold a confirmed job — the real replacement for the mock
 * availability generator once the owner starts moving requests to 'scheduled'.
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

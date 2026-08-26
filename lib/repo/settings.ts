// ─────────────────────────────────────────────────────────────────────────────
// Application settings, holidays, service areas, employee shifts and time off.
//
// Everything the scheduler needs that an owner is expected to change without a
// deploy. Values are JSON blobs keyed by name; `getSetting` is typed by its
// fallback so callers never handle `unknown`.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, bool, flag, getDb, json, nowIso } from '../db';
import { BusinessHours, EmployeeShift, Holiday, ServiceArea, TimeOff } from '../models';

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | Row
    | undefined;
  if (!row) return fallback;
  return json<T>(row.value, fallback);
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, JSON.stringify(value), nowIso());
}

export function allSettings(): Record<string, unknown> {
  const rows = getDb().prepare(`SELECT key, value FROM settings`).all() as Row[];
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = json<unknown>(r.value, null);
  return out;
}

/**
 * The scheduling policy, resolved in one read so the availability engine does
 * not make eight separate round trips per request.
 */
export interface SchedulingConfig {
  businessHours: BusinessHours;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  defaultTravelMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  cancellationNoticeHours: number;
  depositPercent: number;
  timezone: string;
}

export function getSchedulingConfig(): SchedulingConfig {
  const rows = getDb().prepare(`SELECT key, value FROM settings`).all() as Row[];
  const map = new Map<string, unknown>();
  for (const r of rows) map.set(r.key, json<unknown>(r.value, null));

  const pick = <T>(key: string, fallback: T): T => {
    const v = map.get(key);
    return v === null || v === undefined ? fallback : (v as T);
  };

  const weekday = { start: 8 * 60, end: 19 * 60 };
  return {
    businessHours: pick<BusinessHours>('business_hours', {
      '0': null,
      '1': weekday,
      '2': weekday,
      '3': weekday,
      '4': weekday,
      '5': weekday,
      '6': { start: 8 * 60, end: 17 * 60 },
    }),
    slotIntervalMinutes: pick('slot_interval_minutes', 30),
    bufferMinutes: pick('buffer_minutes', 30),
    defaultTravelMinutes: pick('default_travel_minutes', 30),
    minNoticeHours: pick('min_notice_hours', 12),
    maxAdvanceDays: pick('max_advance_days', 90),
    cancellationNoticeHours: pick('cancellation_notice_hours', 24),
    depositPercent: pick('deposit_percent', 0),
    timezone: pick('timezone', 'America/Chicago'),
  };
}

// ── Holidays ─────────────────────────────────────────────────────────────────

export function listHolidays(): Holiday[] {
  const rows = getDb().prepare(`SELECT * FROM holidays ORDER BY date ASC`).all() as Row[];
  return rows.map((r) => ({ id: r.id, date: r.date, label: r.label }));
}

/** Fast membership test for the availability loop. */
export function holidaySet(): Set<string> {
  return new Set(listHolidays().map((h) => h.date));
}

export function addHoliday(date: string, label: string): void {
  getDb()
    .prepare(`INSERT OR REPLACE INTO holidays (id, date, label) VALUES (?, ?, ?)`)
    .run(crypto.randomUUID(), date, label);
}

export function removeHoliday(id: string): void {
  getDb().prepare(`DELETE FROM holidays WHERE id = ?`).run(id);
}

// ── Service areas ────────────────────────────────────────────────────────────

function toArea(row: Row): ServiceArea {
  return {
    id: row.id,
    name: row.name,
    postalCodes: json<string[]>(row.postal_codes, []),
    travelMinutes: row.travel_minutes,
    surchargeCents: row.surcharge_cents,
    active: bool(row.active),
  };
}

export function listServiceAreas(activeOnly = false): ServiceArea[] {
  const rows = getDb()
    .prepare(`SELECT * FROM service_areas${activeOnly ? ' WHERE active = 1' : ''} ORDER BY name`)
    .all() as Row[];
  return rows.map(toArea);
}

export function getServiceArea(id: string): ServiceArea | null {
  const row = getDb().prepare(`SELECT * FROM service_areas WHERE id = ?`).get(id) as Row | undefined;
  return row ? toArea(row) : null;
}

export function upsertServiceArea(area: Omit<ServiceArea, 'id'> & { id?: string }): ServiceArea {
  const id = area.id ?? crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO service_areas (id, name, postal_codes, travel_minutes, surcharge_cents, active)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         postal_codes = excluded.postal_codes,
         travel_minutes = excluded.travel_minutes,
         surcharge_cents = excluded.surcharge_cents,
         active = excluded.active`
    )
    .run(
      id,
      area.name,
      JSON.stringify(area.postalCodes),
      area.travelMinutes,
      area.surchargeCents,
      flag(area.active)
    );
  return getServiceArea(id)!;
}

// ── Employee shifts ──────────────────────────────────────────────────────────

export function listShifts(employeeId: string): EmployeeShift[] {
  const rows = getDb()
    .prepare(`SELECT * FROM employee_schedules WHERE employee_id = ? ORDER BY weekday, start_min`)
    .all(employeeId) as Row[];
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    weekday: r.weekday,
    startMin: r.start_min,
    endMin: r.end_min,
  }));
}

/** Replaces an employee's whole week — the shift editor posts the full set. */
export function replaceShifts(
  employeeId: string,
  shifts: { weekday: number; startMin: number; endMin: number }[]
): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM employee_schedules WHERE employee_id = ?`).run(employeeId);
    const stmt = db.prepare(
      `INSERT INTO employee_schedules (id, employee_id, weekday, start_min, end_min)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const s of shifts) {
      if (s.endMin <= s.startMin) continue; // silently drop inverted rows
      stmt.run(crypto.randomUUID(), employeeId, s.weekday, s.startMin, s.endMin);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Shifts for every employee, grouped — one query for the whole calendar. */
export function shiftsByEmployee(): Map<string, EmployeeShift[]> {
  const rows = getDb()
    .prepare(`SELECT * FROM employee_schedules ORDER BY weekday, start_min`)
    .all() as Row[];
  const map = new Map<string, EmployeeShift[]>();
  for (const r of rows) {
    const shift: EmployeeShift = {
      id: r.id,
      employeeId: r.employee_id,
      weekday: r.weekday,
      startMin: r.start_min,
      endMin: r.end_min,
    };
    const list = map.get(shift.employeeId) ?? [];
    list.push(shift);
    map.set(shift.employeeId, list);
  }
  return map;
}

// ── Time off ─────────────────────────────────────────────────────────────────

function toTimeOff(row: Row): TimeOff {
  return {
    id: row.id,
    employeeId: row.employee_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function listTimeOff(opts: { employeeId?: string; from?: string; to?: string } = {}): TimeOff[] {
  const where: string[] = [`status = 'approved'`];
  const values: unknown[] = [];
  if (opts.employeeId) {
    where.push('employee_id = ?');
    values.push(opts.employeeId);
  }
  // Overlap test, not containment — a two-week holiday must be found by a query
  // for any single day inside it.
  if (opts.from && opts.to) {
    where.push('starts_at < ? AND ends_at > ?');
    values.push(opts.to, opts.from);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM time_off WHERE ${where.join(' AND ')} ORDER BY starts_at`)
    .all(...(values as any[])) as Row[];
  return rows.map(toTimeOff);
}

export function addTimeOff(input: {
  employeeId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  status?: string;
}): TimeOff {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO time_off (id, employee_id, starts_at, ends_at, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.employeeId,
      input.startsAt,
      input.endsAt,
      input.reason,
      input.status ?? 'approved',
      nowIso()
    );
  const row = getDb().prepare(`SELECT * FROM time_off WHERE id = ?`).get(id) as Row;
  return toTimeOff(row);
}

export function removeTimeOff(id: string): void {
  getDb().prepare(`DELETE FROM time_off WHERE id = ?`).run(id);
}

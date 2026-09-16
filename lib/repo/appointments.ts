// ─────────────────────────────────────────────────────────────────────────────
// Appointments.
//
// The overlap query in `conflictsFor()` is the single most important thing in
// this file — it is what stops two customers being sold the same slot. Two
// windows overlap when `aStart < bEnd AND aEnd > bStart`; travel and buffer are
// baked into the stored window so the comparison stays that one expression.
//
// Cancelled and no-show appointments are excluded from conflict checks so a
// cancellation genuinely frees the slot.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { Appointment, AppointmentStatus, AppointmentView, LocationType } from '../models';
import { Industry, SizeClass } from '../types';
import { generateReference } from '../security';

/** Statuses that still occupy the calendar. */
const BLOCKING = ['scheduled', 'confirmed', 'in_progress', 'completed'] as const;
const BLOCKING_SQL = BLOCKING.map((s) => `'${s}'`).join(', ');

function toAppointment(row: Row): Appointment {
  return {
    id: row.id,
    reference: row.reference,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id ?? null,
    employeeId: row.employee_id ?? null,
    estimateId: row.estimate_id ?? null,
    industry: row.industry as Industry,
    sizeClass: row.size_class as SizeClass,
    serviceIds: json<string[]>(row.service_ids, []),
    addOnIds: json<string[]>(row.addon_ids, []),
    locationType: row.location_type as LocationType,
    address: row.address,
    serviceAreaId: row.service_area_id ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    travelMinutes: row.travel_minutes,
    bufferMinutes: row.buffer_minutes,
    quotedTotal: row.quoted_total,
    quotedTotalMax: row.quoted_total_max,
    estimatedHours: row.estimated_hours,
    depositCents: row.deposit_cents,
    paidCents: row.paid_cents,
    status: row.status as AppointmentStatus,
    notes: row.notes,
    photoUrls: json<string[]>(row.photo_urls, []),
    cancelReason: row.cancel_reason ?? null,
    cancelledAt: row.cancelled_at ?? null,
    remindedAt: row.reminded_at ?? null,
    remindedSoonAt: row.reminded_soon_at ?? null,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toView(row: Row): AppointmentView {
  return {
    ...toAppointment(row),
    customerName: row.customer_name ?? '',
    customerEmail: row.customer_email ?? '',
    customerPhone: row.customer_phone ?? '',
    employeeName: row.employee_name ?? null,
    vehicleLabel:
      [row.v_year, row.v_make, row.v_model].filter(Boolean).join(' ').trim() || null,
  };
}

/** Shared join so every list endpoint returns the same enriched shape. */
const VIEW_SELECT = `
  SELECT a.*,
         c.name  AS customer_name,
         c.email AS customer_email,
         c.phone AS customer_phone,
         e.name  AS employee_name,
         v.year  AS v_year, v.make AS v_make, v.model AS v_model
    FROM appointments a
    JOIN users c    ON c.id = a.customer_id
    LEFT JOIN users e    ON e.id = a.employee_id
    LEFT JOIN vehicles v ON v.id = a.vehicle_id
`;

export interface CreateAppointmentInput {
  customerId: string;
  vehicleId: string | null;
  employeeId: string | null;
  estimateId?: string | null;
  industry: Industry;
  sizeClass: SizeClass;
  serviceIds: string[];
  addOnIds: string[];
  locationType: LocationType;
  address: string;
  serviceAreaId?: string | null;
  startsAt: string;
  endsAt: string;
  travelMinutes: number;
  bufferMinutes: number;
  quotedTotal: number;
  quotedTotalMax: number;
  estimatedHours: number;
  depositCents?: number;
  notes: string;
  photoUrls?: string[];
  source?: string;
}

export function createAppointment(input: CreateAppointmentInput): Appointment {
  const id = crypto.randomUUID();
  const now = nowIso();

  getDb()
    .prepare(
      `INSERT INTO appointments (
         id, reference, customer_id, vehicle_id, employee_id, estimate_id,
         industry, size_class, service_ids, addon_ids,
         location_type, address, service_area_id,
         starts_at, ends_at, travel_minutes, buffer_minutes,
         quoted_total, quoted_total_max, estimated_hours, deposit_cents,
         status, notes, photo_urls, source, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      generateReference(),
      input.customerId,
      input.vehicleId,
      input.employeeId,
      input.estimateId ?? null,
      input.industry,
      input.sizeClass,
      JSON.stringify(input.serviceIds),
      JSON.stringify(input.addOnIds),
      input.locationType,
      input.address,
      input.serviceAreaId ?? null,
      input.startsAt,
      input.endsAt,
      input.travelMinutes,
      input.bufferMinutes,
      input.quotedTotal,
      input.quotedTotalMax,
      input.estimatedHours,
      input.depositCents ?? 0,
      'scheduled',
      input.notes,
      JSON.stringify(input.photoUrls ?? []),
      input.source ?? 'app',
      now,
      now
    );

  return getAppointment(id)!;
}

export function getAppointment(id: string): Appointment | null {
  const row = getDb().prepare(`SELECT * FROM appointments WHERE id = ?`).get(id) as Row | undefined;
  return row ? toAppointment(row) : null;
}

export function getAppointmentView(id: string): AppointmentView | null {
  const row = getDb().prepare(`${VIEW_SELECT} WHERE a.id = ?`).get(id) as Row | undefined;
  return row ? toView(row) : null;
}

export function getAppointmentByReference(reference: string): Appointment | null {
  const row = getDb().prepare(`SELECT * FROM appointments WHERE reference = ?`).get(reference) as
    | Row
    | undefined;
  return row ? toAppointment(row) : null;
}

// ── Conflict detection ───────────────────────────────────────────────────────

export interface ConflictQuery {
  startsAt: string;
  endsAt: string;
  /** When set, only that technician's calendar is consulted. */
  employeeId?: string | null;
  /** Excluded from the check — used when rescheduling an existing booking. */
  ignoreId?: string;
}

/**
 * Appointments that overlap the proposed window.
 *
 * With `employeeId` null the check is business-wide, which is the correct
 * behaviour for a solo operator: every booking blocks every other. Once staff
 * exist, callers pass a technician and each calendar is independent.
 */
export function conflictsFor(q: ConflictQuery): Appointment[] {
  const where: string[] = [
    `status IN (${BLOCKING_SQL})`,
    'starts_at < ?',
    'ends_at > ?',
  ];
  const values: unknown[] = [q.endsAt, q.startsAt];

  if (q.employeeId) {
    where.push('employee_id = ?');
    values.push(q.employeeId);
  }
  if (q.ignoreId) {
    where.push('id != ?');
    values.push(q.ignoreId);
  }

  const rows = getDb()
    .prepare(`SELECT * FROM appointments WHERE ${where.join(' AND ')}`)
    .all(...(values as any[])) as Row[];
  return rows.map(toAppointment);
}

/** Every blocking appointment in a window — the availability engine's input. */
export function appointmentsInWindow(
  fromIso: string,
  toIso: string,
  employeeId?: string | null
): Appointment[] {
  const where = [`status IN (${BLOCKING_SQL})`, 'starts_at < ?', 'ends_at > ?'];
  const values: unknown[] = [toIso, fromIso];
  if (employeeId) {
    where.push('employee_id = ?');
    values.push(employeeId);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM appointments WHERE ${where.join(' AND ')} ORDER BY starts_at`)
    .all(...(values as any[])) as Row[];
  return rows.map(toAppointment);
}

// ── Listing ──────────────────────────────────────────────────────────────────

export interface ListAppointmentsOptions {
  customerId?: string;
  employeeId?: string;
  statuses?: AppointmentStatus[];
  from?: string;
  to?: string;
  /** 'upcoming' sorts ascending from now; 'past' descending. */
  direction?: 'upcoming' | 'past' | 'all';
  limit?: number;
  offset?: number;
  search?: string;
}

export function listAppointments(opts: ListAppointmentsOptions = {}): AppointmentView[] {
  const where: string[] = [];
  const values: unknown[] = [];

  if (opts.customerId) {
    where.push('a.customer_id = ?');
    values.push(opts.customerId);
  }
  if (opts.employeeId) {
    where.push('a.employee_id = ?');
    values.push(opts.employeeId);
  }
  if (opts.statuses?.length) {
    where.push(`a.status IN (${opts.statuses.map(() => '?').join(', ')})`);
    values.push(...opts.statuses);
  }
  if (opts.from) {
    where.push('a.starts_at >= ?');
    values.push(opts.from);
  }
  if (opts.to) {
    where.push('a.starts_at < ?');
    values.push(opts.to);
  }
  if (opts.search) {
    where.push('(c.name LIKE ? OR c.email LIKE ? OR a.reference LIKE ?)');
    const q = `%${opts.search}%`;
    values.push(q, q, q);
  }

  let order = 'a.starts_at DESC';
  if (opts.direction === 'upcoming') {
    where.push('a.starts_at >= ?');
    values.push(nowIso());
    order = 'a.starts_at ASC';
  } else if (opts.direction === 'past') {
    where.push('a.starts_at < ?');
    values.push(nowIso());
  }

  values.push(opts.limit ?? 100, opts.offset ?? 0);

  const rows = getDb()
    .prepare(
      `${VIEW_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...(values as any[])) as Row[];
  return rows.map(toView);
}

// ── Mutation ─────────────────────────────────────────────────────────────────

export interface UpdateAppointmentInput {
  employeeId?: string | null;
  startsAt?: string;
  endsAt?: string;
  travelMinutes?: number;
  bufferMinutes?: number;
  status?: AppointmentStatus;
  notes?: string;
  address?: string;
  locationType?: LocationType;
  serviceIds?: string[];
  addOnIds?: string[];
  quotedTotal?: number;
  quotedTotalMax?: number;
  estimatedHours?: number;
  vehicleId?: string | null;
  depositCents?: number;
  paidCents?: number;
  photoUrls?: string[];
  remindedAt?: string;
  remindedSoonAt?: string;
}

export function updateAppointment(
  id: string,
  patch: UpdateAppointmentInput
): Appointment | null {
  const columns: Record<string, string> = {
    employeeId: 'employee_id',
    startsAt: 'starts_at',
    endsAt: 'ends_at',
    travelMinutes: 'travel_minutes',
    bufferMinutes: 'buffer_minutes',
    status: 'status',
    notes: 'notes',
    address: 'address',
    locationType: 'location_type',
    quotedTotal: 'quoted_total',
    quotedTotalMax: 'quoted_total_max',
    estimatedHours: 'estimated_hours',
    vehicleId: 'vehicle_id',
    depositCents: 'deposit_cents',
    paidCents: 'paid_cents',
    remindedAt: 'reminded_at',
    remindedSoonAt: 'reminded_soon_at',
  };
  const jsonColumns: Record<string, string> = {
    serviceIds: 'service_ids',
    addOnIds: 'addon_ids',
    photoUrls: 'photo_urls',
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(value);
  }
  for (const [key, column] of Object.entries(jsonColumns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(JSON.stringify(value));
  }

  if (!sets.length) return getAppointment(id);

  sets.push('updated_at = ?');
  values.push(nowIso(), id);

  getDb()
    .prepare(`UPDATE appointments SET ${sets.join(', ')} WHERE id = ?`)
    .run(...(values as any[]));
  return getAppointment(id);
}

export function cancelAppointment(id: string, reason: string): Appointment | null {
  getDb()
    .prepare(
      `UPDATE appointments SET status = 'cancelled', cancel_reason = ?, cancelled_at = ?,
              updated_at = ? WHERE id = ?`
    )
    .run(reason, nowIso(), nowIso(), id);
  return getAppointment(id);
}

// ── Aggregates for the business dashboard ────────────────────────────────────

export interface RevenueBucket {
  key: string;
  revenue: number;
  jobs: number;
}

/**
 * Completed revenue between two instants. `quoted_total` is used rather than
 * payments so the dashboard is meaningful before Stripe is connected; once
 * payments are live, `revenueFromPayments()` in lib/repo/payments.ts is the
 * authoritative figure and the dashboard shows both.
 */
export function revenueBetween(fromIso: string, toIso: string): { revenue: number; jobs: number } {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(quoted_total), 0) AS revenue, COUNT(*) AS jobs
         FROM appointments
        WHERE status = 'completed' AND starts_at >= ? AND starts_at < ?`
    )
    .get(fromIso, toIso) as { revenue: number; jobs: number };
  return { revenue: Number(row.revenue), jobs: Number(row.jobs) };
}

export function revenueByEmployee(fromIso: string, toIso: string): RevenueBucket[] {
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(u.name, 'Unassigned') AS key,
              COALESCE(SUM(a.quoted_total), 0) AS revenue,
              COUNT(*) AS jobs
         FROM appointments a
         LEFT JOIN users u ON u.id = a.employee_id
        WHERE a.status = 'completed' AND a.starts_at >= ? AND a.starts_at < ?
        GROUP BY a.employee_id
        ORDER BY revenue DESC`
    )
    .all(fromIso, toIso) as Row[];
  return rows.map((r) => ({ key: r.key, revenue: Number(r.revenue), jobs: Number(r.jobs) }));
}

export function revenueByIndustry(fromIso: string, toIso: string): RevenueBucket[] {
  const rows = getDb()
    .prepare(
      `SELECT industry AS key, COALESCE(SUM(quoted_total), 0) AS revenue, COUNT(*) AS jobs
         FROM appointments
        WHERE status = 'completed' AND starts_at >= ? AND starts_at < ?
        GROUP BY industry ORDER BY revenue DESC`
    )
    .all(fromIso, toIso) as Row[];
  return rows.map((r) => ({ key: r.key, revenue: Number(r.revenue), jobs: Number(r.jobs) }));
}

export function revenueByCustomer(fromIso: string, toIso: string, limit = 10): RevenueBucket[] {
  const rows = getDb()
    .prepare(
      `SELECT u.name AS key, COALESCE(SUM(a.quoted_total), 0) AS revenue, COUNT(*) AS jobs
         FROM appointments a JOIN users u ON u.id = a.customer_id
        WHERE a.status = 'completed' AND a.starts_at >= ? AND a.starts_at < ?
        GROUP BY a.customer_id ORDER BY revenue DESC LIMIT ?`
    )
    .all(fromIso, toIso, limit) as Row[];
  return rows.map((r) => ({ key: r.key, revenue: Number(r.revenue), jobs: Number(r.jobs) }));
}

/**
 * Revenue attributed per service. Service ids live in a JSON array, so the
 * split is done in JS — correct, and at this data volume immeasurably fast.
 * If the appointment table ever reaches millions of rows, normalise into an
 * `appointment_services` join table instead.
 */
export function revenueByService(fromIso: string, toIso: string): RevenueBucket[] {
  const rows = getDb()
    .prepare(
      `SELECT service_ids, quoted_total FROM appointments
        WHERE status = 'completed' AND starts_at >= ? AND starts_at < ?`
    )
    .all(fromIso, toIso) as Row[];

  const totals = new Map<string, { revenue: number; jobs: number }>();
  for (const row of rows) {
    const ids = json<string[]>(row.service_ids, []);
    if (!ids.length) continue;
    const share = Number(row.quoted_total) / ids.length;
    for (const id of ids) {
      const cur = totals.get(id) ?? { revenue: 0, jobs: 0 };
      cur.revenue += share;
      cur.jobs += 1;
      totals.set(id, cur);
    }
  }

  return Array.from(totals.entries())
    .map(([key, v]) => ({ key, revenue: Math.round(v.revenue), jobs: v.jobs }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Daily completed revenue, for the dashboard chart. */
export function revenueSeries(fromIso: string, toIso: string): RevenueBucket[] {
  const rows = getDb()
    .prepare(
      `SELECT substr(starts_at, 1, 10) AS key,
              COALESCE(SUM(quoted_total), 0) AS revenue,
              COUNT(*) AS jobs
         FROM appointments
        WHERE status = 'completed' AND starts_at >= ? AND starts_at < ?
        GROUP BY key ORDER BY key ASC`
    )
    .all(fromIso, toIso) as Row[];
  return rows.map((r) => ({ key: r.key, revenue: Number(r.revenue), jobs: Number(r.jobs) }));
}

export function countByStatus(fromIso: string, toIso: string): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT status, COUNT(*) AS n FROM appointments
        WHERE starts_at >= ? AND starts_at < ? GROUP BY status`
    )
    .all(fromIso, toIso) as Row[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

/** Customers with more than one completed appointment — the repeat rate. */
export function repeatCustomerStats(): { total: number; repeat: number } {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) AS repeat_count
         FROM (SELECT customer_id, COUNT(*) AS n FROM appointments
                WHERE status = 'completed' GROUP BY customer_id)`
    )
    .get() as { total: number; repeat_count: number | null };
  return { total: Number(row.total), repeat: Number(row.repeat_count ?? 0) };
}

/**
 * Appointments starting inside a window that have not had the given reminder
 * sent. 'day' is the day-before reminder (reminded_at); 'soon' the 2½-hour
 * one (reminded_soon_at). Each has its own stamp so they are independently
 * idempotent.
 */
export function dueForReminder(
  fromIso: string,
  toIso: string,
  kind: 'day' | 'soon' = 'day'
): Appointment[] {
  const column = kind === 'soon' ? 'reminded_soon_at' : 'reminded_at';
  const rows = getDb()
    .prepare(
      `SELECT * FROM appointments
        WHERE status IN ('scheduled', 'confirmed')
          AND ${column} IS NULL
          AND starts_at >= ? AND starts_at < ?`
    )
    .all(fromIso, toIso) as Row[];
  return rows.map(toAppointment);
}

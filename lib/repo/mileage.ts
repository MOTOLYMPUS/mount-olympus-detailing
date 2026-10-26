// ─────────────────────────────────────────────────────────────────────────────
// Mileage — business vehicles, trips, and the geocode cache.
//
// Admin-only at every layer, like expenses: the API routes gate on 'admin' and
// nothing customer- or staff-facing reads these tables.
//
// Miles are integer TENTHS of a mile throughout (1006 = 100.6 mi). Trip
// distance comes from routing to a tenth, and summing integers keeps a year's
// total exact.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, bool, flag, getDb, json, nowIso } from '../db';
import {
  BusinessVehicle,
  BusinessVehicleYear,
  DeductionMethod,
  Trip,
  TripSource,
  TripStop,
  VehicleOwnership,
} from '../models';

// ── Business vehicles ────────────────────────────────────────────────────────

function yearsFor(vehicleId: string): BusinessVehicleYear[] {
  const rows = getDb()
    .prepare(`SELECT * FROM business_vehicle_years WHERE vehicle_id = ? ORDER BY tax_year DESC`)
    .all(vehicleId) as Row[];
  return rows.map((r) => ({
    taxYear: Number(r.tax_year),
    odometerStart: r.odometer_start ?? null,
    odometerEnd: r.odometer_end ?? null,
  }));
}

function toVehicle(row: Row): BusinessVehicle {
  return {
    id: row.id,
    description: row.description,
    ownership: row.ownership as VehicleOwnership,
    placedInServiceOn: row.placed_in_service_on ?? null,
    odometerInService: row.odometer_in_service ?? null,
    deductionMethod: row.deduction_method as DeductionMethod,
    qualifiedNonpersonal: bool(row.qualified_nonpersonal),
    isDefault: bool(row.is_default),
    activeFrom: row.active_from ?? null,
    retiredOn: row.retired_on ?? null,
    notes: row.notes ?? '',
    years: yearsFor(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BusinessVehicleInput {
  description: string;
  ownership: VehicleOwnership;
  placedInServiceOn: string | null;
  odometerInService: number | null;
  deductionMethod: DeductionMethod;
  qualifiedNonpersonal: boolean;
  isDefault: boolean;
  activeFrom: string | null;
  retiredOn: string | null;
  notes: string;
}

export function listBusinessVehicles(): BusinessVehicle[] {
  const rows = getDb()
    .prepare(`SELECT * FROM business_vehicles ORDER BY retired_on IS NOT NULL, COALESCE(active_from, '') DESC, description`)
    .all() as Row[];
  return rows.map(toVehicle);
}

export function getBusinessVehicle(id: string): BusinessVehicle | null {
  const row = getDb().prepare(`SELECT * FROM business_vehicles WHERE id = ?`).get(id) as Row | undefined;
  return row ? toVehicle(row) : null;
}

export function createBusinessVehicle(input: BusinessVehicleInput): BusinessVehicle {
  const id = crypto.randomUUID();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO business_vehicles (id, description, ownership, placed_in_service_on, odometer_in_service,
                                      deduction_method, qualified_nonpersonal, is_default, active_from,
                                      retired_on, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.description,
      input.ownership,
      input.placedInServiceOn,
      input.odometerInService,
      input.deductionMethod,
      flag(input.qualifiedNonpersonal),
      flag(input.isDefault),
      input.activeFrom,
      input.retiredOn,
      input.notes,
      now,
      now
    );
  return getBusinessVehicle(id)!;
}

export function updateBusinessVehicle(id: string, input: BusinessVehicleInput): BusinessVehicle | null {
  const info = getDb()
    .prepare(
      `UPDATE business_vehicles SET description = ?, ownership = ?, placed_in_service_on = ?,
              odometer_in_service = ?, deduction_method = ?, qualified_nonpersonal = ?, is_default = ?,
              active_from = ?, retired_on = ?, notes = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(
      input.description,
      input.ownership,
      input.placedInServiceOn,
      input.odometerInService,
      input.deductionMethod,
      flag(input.qualifiedNonpersonal),
      flag(input.isDefault),
      input.activeFrom,
      input.retiredOn,
      input.notes,
      nowIso(),
      id
    );
  return Number(info.changes) ? getBusinessVehicle(id) : null;
}

/** Trips keep their row (vehicle set to NULL) so the log stays complete. */
export function deleteBusinessVehicle(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM business_vehicles WHERE id = ?`).run(id);
  return Number(info.changes) > 0;
}

export function setVehicleYear(vehicleId: string, year: BusinessVehicleYear): void {
  getDb()
    .prepare(
      `INSERT INTO business_vehicle_years (vehicle_id, tax_year, odometer_start, odometer_end)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(vehicle_id, tax_year) DO UPDATE SET
         odometer_start = excluded.odometer_start, odometer_end = excluded.odometer_end`
    )
    .run(vehicleId, year.taxYear, year.odometerStart, year.odometerEnd);
}

export function removeVehicleYear(vehicleId: string, taxYear: number): void {
  getDb()
    .prepare(`DELETE FROM business_vehicle_years WHERE vehicle_id = ? AND tax_year = ?`)
    .run(vehicleId, taxYear);
}

/**
 * The vehicle a trip on `date` defaults to: one in service that day, preferring
 * the one marked default. With the SUV active Feb 7 – Apr 9 and the van from
 * Apr 10, a March job lands on the SUV and a May job on the van.
 */
export function defaultVehicleFor(date: string): BusinessVehicle | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM business_vehicles
        WHERE (active_from IS NULL OR active_from <= ?)
          AND (retired_on IS NULL OR retired_on >= ?)
        ORDER BY is_default DESC, COALESCE(active_from, '') DESC, created_at DESC
        LIMIT 1`
    )
    .get(date, date) as Row | undefined;
  return row ? toVehicle(row) : null;
}

// ── Trips ────────────────────────────────────────────────────────────────────

function appointmentIdsFor(tripId: string): string[] {
  const rows = getDb()
    .prepare(`SELECT appointment_id FROM trip_appointments WHERE trip_id = ?`)
    .all(tripId) as Row[];
  return rows.map((r) => r.appointment_id);
}

function toTrip(row: Row): Trip {
  return {
    id: row.id,
    tripDate: row.trip_date,
    businessVehicleId: row.business_vehicle_id ?? null,
    startAddress: row.start_address ?? '',
    stops: json<TripStop[]>(row.stops, []),
    endAddress: row.end_address ?? '',
    purpose: row.purpose ?? '',
    milesTenths: row.miles_tenths ?? null,
    source: row.source as TripSource,
    odometerStart: row.odometer_start ?? null,
    odometerEnd: row.odometer_end ?? null,
    odometerStartKey: row.odometer_start_key ?? null,
    odometerEndKey: row.odometer_end_key ?? null,
    needsReview: bool(row.needs_review),
    reviewReason: row.review_reason ?? '',
    notes: row.notes ?? '',
    appointmentIds: appointmentIdsFor(row.id),
    expenseId: row.expense_id ?? null,
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TripInput {
  tripDate: string;
  businessVehicleId: string | null;
  startAddress: string;
  stops: TripStop[];
  endAddress: string;
  purpose: string;
  milesTenths: number | null;
  source: TripSource;
  odometerStart: number | null;
  odometerEnd: number | null;
  odometerStartKey: string | null;
  odometerEndKey: string | null;
  needsReview: boolean;
  reviewReason: string;
  notes: string;
}

export function getTrip(id: string): Trip | null {
  const row = getDb().prepare(`SELECT * FROM trips WHERE id = ?`).get(id) as Row | undefined;
  return row ? toTrip(row) : null;
}

export function createTrip(
  input: TripInput,
  createdBy: string | null,
  appointmentIds: string[] = [],
  expenseId: string | null = null
): Trip {
  const id = crypto.randomUUID();
  const now = nowIso();
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO trips (id, trip_date, business_vehicle_id, start_address, stops, end_address, purpose,
                          miles_tenths, source, odometer_start, odometer_end, odometer_start_key,
                          odometer_end_key, expense_id, needs_review, review_reason, notes, created_by,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.tripDate,
      input.businessVehicleId,
      input.startAddress,
      JSON.stringify(input.stops),
      input.endAddress,
      input.purpose,
      input.milesTenths,
      input.source,
      input.odometerStart,
      input.odometerEnd,
      input.odometerStartKey,
      input.odometerEndKey,
      expenseId,
      flag(input.needsReview),
      input.reviewReason,
      input.notes,
      createdBy,
      now,
      now
    );
    const link = db.prepare(`INSERT INTO trip_appointments (trip_id, appointment_id) VALUES (?, ?)`);
    for (const appointmentId of appointmentIds) link.run(id, appointmentId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getTrip(id)!;
}

export function updateTrip(id: string, input: TripInput): Trip | null {
  const info = getDb()
    .prepare(
      `UPDATE trips SET trip_date = ?, business_vehicle_id = ?, start_address = ?, stops = ?, end_address = ?,
              purpose = ?, miles_tenths = ?, source = ?, odometer_start = ?, odometer_end = ?,
              odometer_start_key = ?, odometer_end_key = ?, needs_review = ?, review_reason = ?, notes = ?,
              updated_at = ?
        WHERE id = ?`
    )
    .run(
      input.tripDate,
      input.businessVehicleId,
      input.startAddress,
      JSON.stringify(input.stops),
      input.endAddress,
      input.purpose,
      input.milesTenths,
      input.source,
      input.odometerStart,
      input.odometerEnd,
      input.odometerStartKey,
      input.odometerEndKey,
      flag(input.needsReview),
      input.reviewReason,
      input.notes,
      nowIso(),
      id
    );
  return Number(info.changes) ? getTrip(id) : null;
}

/** Set only the computed distance (or the reason it could not be computed). */
export function setTripMiles(id: string, milesTenths: number | null, reviewReason: string): void {
  getDb()
    .prepare(`UPDATE trips SET miles_tenths = ?, needs_review = ?, review_reason = ?, updated_at = ? WHERE id = ?`)
    .run(milesTenths, flag(!!reviewReason), reviewReason, nowIso(), id);
}

export function deleteTrip(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM trips WHERE id = ?`).run(id);
  return Number(info.changes) > 0;
}

export function linkAppointment(tripId: string, appointmentId: string): void {
  getDb()
    .prepare(`INSERT OR IGNORE INTO trip_appointments (trip_id, appointment_id) VALUES (?, ?)`)
    .run(tripId, appointmentId);
}

export function tripForAppointment(appointmentId: string): Trip | null {
  const row = getDb()
    .prepare(
      `SELECT t.* FROM trips t JOIN trip_appointments ta ON ta.trip_id = t.id WHERE ta.appointment_id = ?`
    )
    .get(appointmentId) as Row | undefined;
  return row ? toTrip(row) : null;
}

export function tripForExpense(expenseId: string): Trip | null {
  const row = getDb().prepare(`SELECT * FROM trips WHERE expense_id = ?`).get(expenseId) as Row | undefined;
  return row ? toTrip(row) : null;
}

/** An auto-logged job loop already running on that day in that vehicle, to chain onto. */
export function jobLoopFor(date: string, vehicleId: string | null): Trip | null {
  const row = getDb()
    .prepare(
      `SELECT t.* FROM trips t
        WHERE t.trip_date = ? AND t.business_vehicle_id IS ?
          AND EXISTS (SELECT 1 FROM trip_appointments ta WHERE ta.trip_id = t.id)
        ORDER BY t.created_at LIMIT 1`
    )
    .get(date, vehicleId) as Row | undefined;
  return row ? toTrip(row) : null;
}

export interface TripQuery {
  /** Inclusive YYYY-MM-DD bounds. */
  from?: string;
  to?: string;
  /** A vehicle id, or 'none' for trips with no vehicle. */
  vehicleId?: string;
  limit?: number;
}

export function listTrips(q: TripQuery = {}): Trip[] {
  const where: string[] = [];
  const values: unknown[] = [];
  if (q.from) {
    where.push('trip_date >= ?');
    values.push(q.from);
  }
  if (q.to) {
    where.push('trip_date <= ?');
    values.push(q.to);
  }
  if (q.vehicleId === 'none') {
    where.push('business_vehicle_id IS NULL');
  } else if (q.vehicleId) {
    where.push('business_vehicle_id = ?');
    values.push(q.vehicleId);
  }
  values.push(q.limit ?? 1000);

  const rows = getDb()
    .prepare(
      `SELECT * FROM trips${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY trip_date DESC, created_at DESC LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  return rows.map(toTrip);
}

/** Business miles per vehicle in a window. Key '' = trips with no vehicle. */
export function milesByVehicle(from: string, to: string): Map<string, { milesTenths: number; trips: number; pending: number }> {
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(business_vehicle_id, '') AS vehicle,
              COALESCE(SUM(miles_tenths), 0) AS miles,
              COUNT(*) AS n,
              SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS pending
         FROM trips WHERE trip_date >= ? AND trip_date <= ?
        GROUP BY COALESCE(business_vehicle_id, '')`
    )
    .all(from, to) as Row[];
  const out = new Map<string, { milesTenths: number; trips: number; pending: number }>();
  for (const r of rows) {
    out.set(r.vehicle, { milesTenths: Number(r.miles), trips: Number(r.n), pending: Number(r.pending) });
  }
  return out;
}

// ── Geocode cache ────────────────────────────────────────────────────────────

export interface CachedGeocode {
  lat: number;
  lon: number;
  label: string;
}

export function cachedGeocode(query: string): CachedGeocode | null {
  const row = getDb().prepare(`SELECT * FROM geocode_cache WHERE query = ?`).get(query) as Row | undefined;
  return row ? { lat: Number(row.lat), lon: Number(row.lon), label: row.label ?? '' } : null;
}

export function cacheGeocode(query: string, value: CachedGeocode, provider: string): void {
  getDb()
    .prepare(
      `INSERT INTO geocode_cache (query, lat, lon, label, provider, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(query) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, label = excluded.label,
         provider = excluded.provider, created_at = excluded.created_at`
    )
    .run(query, value.lat, value.lon, value.label, provider, nowIso());
}

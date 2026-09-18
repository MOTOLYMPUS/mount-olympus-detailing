// ─────────────────────────────────────────────────────────────────────────────
// The customer's garage.
//
// One table serves cars, motorcycles, boats, PWCs, yachts, aircraft and
// helicopters — they differ only in `industry`, `vehicleType` and `sizeClass`,
// all of which are already defined in lib/industries.ts. Adding a fourth
// industry needs no change here.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, bool, flag, getDb, nowIso } from '../db';
import { Vehicle } from '../models';
import { Industry, SizeClass } from '../types';

function toVehicle(row: Row): Vehicle {
  return {
    id: row.id,
    userId: row.user_id,
    industry: row.industry as Industry,
    vehicleType: row.vehicle_type,
    sizeClass: row.size_class as SizeClass,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    color: row.color,
    vin: row.vin,
    plate: row.plate,
    notes: row.notes,
    photoUrl: row.photo_url ?? null,
    isDefault: bool(row.is_default),
    archived: bool(row.archived),
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface VehicleInput {
  industry: Industry;
  vehicleType: string;
  sizeClass: SizeClass;
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  color?: string;
  vin?: string;
  plate?: string;
  notes?: string;
  photoUrl?: string | null;
  isDefault?: boolean;
}

export function createVehicle(userId: string, input: VehicleInput): Vehicle {
  const id = crypto.randomUUID();
  const now = nowIso();

  getDb()
    .prepare(
      `INSERT INTO vehicles (id, user_id, industry, vehicle_type, size_class, year, make, model,
                             trim, color, vin, plate, notes, photo_url, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      input.industry,
      input.vehicleType,
      input.sizeClass,
      input.year ?? '',
      input.make ?? '',
      input.model ?? '',
      input.trim ?? '',
      input.color ?? '',
      input.vin ?? '',
      input.plate ?? '',
      input.notes ?? '',
      input.photoUrl ?? null,
      flag(input.isDefault),
      now,
      now
    );

  // The first vehicle a customer saves becomes their default, so the booking
  // flow can preselect it without them choosing twice.
  if (input.isDefault) clearOtherDefaults(userId, id);
  else if (listVehicles(userId).length === 1) setDefaultVehicle(userId, id);

  return getVehicle(id)!;
}

export function getVehicle(id: string): Vehicle | null {
  const row = getDb().prepare(`SELECT * FROM vehicles WHERE id = ?`).get(id) as Row | undefined;
  return row ? toVehicle(row) : null;
}

export function listVehicles(userId: string, includeArchived = false): Vehicle[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM vehicles WHERE user_id = ?${includeArchived ? '' : ' AND archived = 0'}
       ORDER BY is_default DESC, created_at DESC`
    )
    .all(userId) as Row[];
  return rows.map(toVehicle);
}

export function updateVehicle(id: string, patch: Partial<VehicleInput>): Vehicle | null {
  const columns: Record<string, string> = {
    industry: 'industry',
    vehicleType: 'vehicle_type',
    sizeClass: 'size_class',
    year: 'year',
    make: 'make',
    model: 'model',
    trim: 'trim',
    color: 'color',
    vin: 'vin',
    plate: 'plate',
    notes: 'notes',
    photoUrl: 'photo_url',
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(value);
  }

  if (sets.length) {
    sets.push('updated_at = ?');
    values.push(nowIso(), id);
    getDb()
      .prepare(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`)
      .run(...(values as any[]));
  }

  if (patch.isDefault) {
    const vehicle = getVehicle(id);
    if (vehicle) setDefaultVehicle(vehicle.userId, id);
  }

  return getVehicle(id);
}

/**
 * Archive rather than delete. An appointment references its vehicle, and a
 * customer removing a car they sold must not blank the history of the work
 * that was done to it.
 */
export function archiveVehicle(id: string): void {
  const now = nowIso();
  getDb()
    .prepare(`UPDATE vehicles SET archived = 1, archived_at = ?, is_default = 0, updated_at = ? WHERE id = ?`)
    .run(now, now, id);
}

export function restoreVehicle(id: string): void {
  getDb()
    .prepare(`UPDATE vehicles SET archived = 0, archived_at = NULL, updated_at = ? WHERE id = ?`)
    .run(nowIso(), id);
}

export function setDefaultVehicle(userId: string, vehicleId: string): void {
  const db = getDb();
  db.prepare(`UPDATE vehicles SET is_default = 0 WHERE user_id = ?`).run(userId);
  db.prepare(`UPDATE vehicles SET is_default = 1, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    nowIso(),
    vehicleId,
    userId
  );
}

function clearOtherDefaults(userId: string, keepId: string): void {
  getDb()
    .prepare(`UPDATE vehicles SET is_default = 0 WHERE user_id = ? AND id != ?`)
    .run(userId, keepId);
}

export function countVehicles(userId: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM vehicles WHERE user_id = ? AND archived = 0`)
    .get(userId) as { n: number };
  return Number(row.n);
}

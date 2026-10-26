// ─────────────────────────────────────────────────────────────────────────────
// Business expenses — the owner's bookkeeping ledger.
//
// Admin-only at every layer: the API routes gate on 'admin', and there is no
// customer- or staff-facing read path. This is the owner's tax data.
//
// Amounts are stored in integer cents, same as payments and invoices, so there
// is never a floating-point rounding surprise in a total that has to match a
// tax return.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, bool, getDb, json, nowIso } from '../db';
import { Expense, ExpenseCategory, ExpenseTrip } from '../models';

type Extras = { photos: Map<string, string[]>; trips: Map<string, ExpenseTrip> };

/**
 * Event photos and the linked trip for a batch of expenses, in two queries
 * however long the list (ids go in as one JSON array, not N placeholders).
 */
function extrasFor(ids: string[]): Extras {
  const photos = new Map<string, string[]>();
  const trips = new Map<string, ExpenseTrip>();
  if (!ids.length) return { photos, trips };
  const list = JSON.stringify(ids);
  const db = getDb();

  for (const r of db
    .prepare(
      `SELECT expense_id, photo_key FROM expense_photos
        WHERE expense_id IN (SELECT value FROM json_each(?)) ORDER BY position, created_at`
    )
    .all(list) as Row[]) {
    photos.set(r.expense_id, [...(photos.get(r.expense_id) ?? []), r.photo_key]);
  }

  for (const r of db
    .prepare(`SELECT * FROM trips WHERE expense_id IN (SELECT value FROM json_each(?))`)
    .all(list) as Row[]) {
    const stops = json<{ address: string }[]>(r.stops, []);
    trips.set(r.expense_id, {
      id: r.id,
      from: r.start_address ?? '',
      to: stops[0]?.address ?? r.end_address ?? '',
      roundTrip: !!r.start_address && r.end_address === r.start_address,
      businessVehicleId: r.business_vehicle_id ?? null,
      milesTenths: r.miles_tenths ?? null,
      manualMiles: r.source !== 'route',
      needsReview: bool(r.needs_review),
      reviewReason: r.review_reason ?? '',
    });
  }
  return { photos, trips };
}

function withExtras(rows: Row[]): Expense[] {
  const extras = extrasFor(rows.map((r) => r.id));
  return rows.map((r) => toExpense(r, extras));
}

function toExpense(row: Row, extras: Extras): Expense {
  return {
    id: row.id,
    spentOn: row.spent_on,
    category: row.category as ExpenseCategory,
    amountCents: row.amount_cents,
    vendor: row.vendor ?? '',
    note: row.note ?? '',
    deductible: !!row.deductible,
    receiptKey: row.receipt_key ?? null,
    appointmentId: row.appointment_id ?? null,
    photoKeys: extras.photos.get(row.id) ?? [],
    trip: extras.trips.get(row.id) ?? null,
    createdBy: row.created_by ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createExpense(input: {
  spentOn: string;
  category: ExpenseCategory;
  amountCents: number;
  vendor?: string;
  note?: string;
  deductible?: boolean;
  receiptKey?: string | null;
  appointmentId?: string | null;
  createdBy: string;
}): Expense {
  const id = crypto.randomUUID();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO expenses (id, spent_on, category, amount_cents, vendor, note,
                             deductible, receipt_key, appointment_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.spentOn,
      input.category,
      input.amountCents,
      input.vendor ?? '',
      input.note ?? '',
      input.deductible === false ? 0 : 1,
      input.receiptKey ?? null,
      input.appointmentId ?? null,
      input.createdBy,
      now,
      now
    );
  return getExpense(id)!;
}

export function getExpense(id: string): Expense | null {
  const row = getDb().prepare(`SELECT * FROM expenses WHERE id = ?`).get(id) as Row | undefined;
  return row ? withExtras([row])[0] : null;
}

export function updateExpense(
  id: string,
  patch: Partial<{
    spentOn: string;
    category: ExpenseCategory;
    amountCents: number;
    vendor: string;
    note: string;
    deductible: boolean;
    receiptKey: string | null;
    appointmentId: string | null;
  }>
): Expense | null {
  const current = getExpense(id);
  if (!current) return null;

  const next = {
    spent_on: patch.spentOn ?? current.spentOn,
    category: patch.category ?? current.category,
    amount_cents: patch.amountCents ?? current.amountCents,
    vendor: patch.vendor ?? current.vendor,
    note: patch.note ?? current.note,
    deductible: (patch.deductible ?? current.deductible) ? 1 : 0,
    receipt_key: patch.receiptKey === undefined ? current.receiptKey : patch.receiptKey,
    appointment_id: patch.appointmentId === undefined ? current.appointmentId : patch.appointmentId,
  };

  getDb()
    .prepare(
      `UPDATE expenses SET spent_on = ?, category = ?, amount_cents = ?, vendor = ?,
                          note = ?, deductible = ?, receipt_key = ?, appointment_id = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(
      next.spent_on,
      next.category,
      next.amount_cents,
      next.vendor,
      next.note,
      next.deductible,
      next.receipt_key,
      next.appointment_id,
      nowIso(),
      id
    );
  return getExpense(id);
}

/** Removes the expense, its event photos (FK cascade) and the trip logged with it. */
export function deleteExpense(id: string): boolean {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM trips WHERE expense_id = ?`).run(id);
    const info = db.prepare(`DELETE FROM expenses WHERE id = ?`).run(id);
    db.exec('COMMIT');
    return Number(info.changes) > 0;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Replace an expense's event photos with `keys`, in that order. */
export function setExpensePhotos(expenseId: string, keys: string[]): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM expense_photos WHERE expense_id = ?`).run(expenseId);
    const stmt = db.prepare(
      `INSERT INTO expense_photos (id, expense_id, photo_key, position, created_at) VALUES (?, ?, ?, ?, ?)`
    );
    keys.forEach((key, i) => stmt.run(crypto.randomUUID(), expenseId, key, i, nowIso()));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Event photos for many expenses at once — the mileage log shows them on linked trips. */
export function photosForExpenses(ids: string[]): Map<string, string[]> {
  return extrasFor(ids).photos;
}

export interface ExpenseQuery {
  /** Inclusive ISO date bounds (YYYY-MM-DD). */
  from?: string;
  to?: string;
  category?: ExpenseCategory;
  limit?: number;
}

export function listExpenses(q: ExpenseQuery = {}): Expense[] {
  const where: string[] = [];
  const values: unknown[] = [];
  if (q.from) {
    where.push('spent_on >= ?');
    values.push(q.from);
  }
  if (q.to) {
    where.push('spent_on <= ?');
    values.push(q.to);
  }
  if (q.category) {
    where.push('category = ?');
    values.push(q.category);
  }
  values.push(q.limit ?? 500);

  const rows = getDb()
    .prepare(
      `SELECT * FROM expenses${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY spent_on DESC, created_at DESC LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  return withExtras(rows);
}

export interface ExpenseSummary {
  totalCents: number;
  deductibleCents: number;
  count: number;
  byCategory: { category: ExpenseCategory; label: string; totalCents: number; count: number }[];
}

/** Category breakdown for a window — powers the tax page and the finance hub. */
export function expenseSummary(from: string, to: string): ExpenseSummary {
  const rows = getDb()
    .prepare(
      `SELECT category,
              COALESCE(SUM(amount_cents), 0) AS total,
              COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN deductible = 1 THEN amount_cents ELSE 0 END), 0) AS deductible
         FROM expenses
        WHERE spent_on >= ? AND spent_on <= ?
        GROUP BY category`
    )
    .all(from, to) as Row[];

  let totalCents = 0;
  let deductibleCents = 0;
  let count = 0;
  const byCategory = rows.map((r) => {
    totalCents += Number(r.total);
    deductibleCents += Number(r.deductible);
    count += Number(r.n);
    return {
      category: r.category as ExpenseCategory,
      label: r.category as string,
      totalCents: Number(r.total),
      count: Number(r.n),
    };
  });

  byCategory.sort((a, b) => b.totalCents - a.totalCents);
  return { totalCents, deductibleCents, count, byCategory };
}

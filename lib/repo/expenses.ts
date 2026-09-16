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
import { Row, getDb, nowIso } from '../db';
import { Expense, ExpenseCategory } from '../models';

function toExpense(row: Row): Expense {
  return {
    id: row.id,
    spentOn: row.spent_on,
    category: row.category as ExpenseCategory,
    amountCents: row.amount_cents,
    vendor: row.vendor ?? '',
    note: row.note ?? '',
    deductible: !!row.deductible,
    receiptKey: row.receipt_key ?? null,
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
  createdBy: string;
}): Expense {
  const id = crypto.randomUUID();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO expenses (id, spent_on, category, amount_cents, vendor, note,
                             deductible, receipt_key, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      input.createdBy,
      now,
      now
    );
  return getExpense(id)!;
}

export function getExpense(id: string): Expense | null {
  const row = getDb().prepare(`SELECT * FROM expenses WHERE id = ?`).get(id) as Row | undefined;
  return row ? toExpense(row) : null;
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
  };

  getDb()
    .prepare(
      `UPDATE expenses SET spent_on = ?, category = ?, amount_cents = ?, vendor = ?,
                          note = ?, deductible = ?, receipt_key = ?, updated_at = ?
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
      nowIso(),
      id
    );
  return getExpense(id);
}

export function deleteExpense(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM expenses WHERE id = ?`).run(id);
  return Number(info.changes) > 0;
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
  return rows.map(toExpense);
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

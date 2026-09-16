// ─────────────────────────────────────────────────────────────────────────────
// Payments and invoices.
//
// The database records money regardless of whether Stripe is configured — an
// owner taking cash or Zelle still needs an invoice and a receipt. The provider
// column distinguishes 'stripe' from 'manual', so the books are complete either
// way and connecting Stripe later does not invalidate historical rows.
//
// Refunds are stored as SEPARATE negative-intent rows rather than mutating the
// original payment, so the ledger is append-only and reconcilable.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { Row, getDb, json, nowIso } from '../db';
import { Invoice, InvoiceLine, Payment, PaymentKind } from '../models';

function toPayment(row: Row): Payment {
  return {
    id: row.id,
    appointmentId: row.appointment_id ?? null,
    userId: row.user_id ?? null,
    kind: row.kind as PaymentKind,
    amountCents: row.amount_cents,
    status: row.status,
    provider: row.provider,
    providerRef: row.provider_ref ?? null,
    methodLabel: row.method_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createPayment(input: {
  appointmentId?: string | null;
  userId: string | null;
  kind: PaymentKind;
  amountCents: number;
  status?: string;
  provider?: string;
  providerRef?: string | null;
  methodLabel?: string;
}): Payment {
  const id = crypto.randomUUID();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO payments (id, appointment_id, user_id, kind, amount_cents, status, provider,
                             provider_ref, method_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.appointmentId ?? null,
      input.userId,
      input.kind,
      input.amountCents,
      input.status ?? 'pending',
      input.provider ?? 'manual',
      input.providerRef ?? null,
      input.methodLabel ?? '',
      now,
      now
    );
  return getPayment(id)!;
}

export function getPayment(id: string): Payment | null {
  const row = getDb().prepare(`SELECT * FROM payments WHERE id = ?`).get(id) as Row | undefined;
  return row ? toPayment(row) : null;
}

export function getPaymentByProviderRef(ref: string): Payment | null {
  const row = getDb().prepare(`SELECT * FROM payments WHERE provider_ref = ?`).get(ref) as
    | Row
    | undefined;
  return row ? toPayment(row) : null;
}

export function setPaymentStatus(
  id: string,
  status: string,
  extra: { providerRef?: string; methodLabel?: string } = {}
): Payment | null {
  const sets = ['status = ?', 'updated_at = ?'];
  const values: unknown[] = [status, nowIso()];
  if (extra.providerRef) {
    sets.splice(1, 0, 'provider_ref = ?');
    values.splice(1, 0, extra.providerRef);
  }
  if (extra.methodLabel) {
    sets.splice(1, 0, 'method_label = ?');
    values.splice(1, 0, extra.methodLabel);
  }
  values.push(id);
  getDb()
    .prepare(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`)
    .run(...(values as any[]));
  return getPayment(id);
}

export function listPayments(opts: { userId?: string; appointmentId?: string; limit?: number } = {}): Payment[] {
  const where: string[] = [];
  const values: unknown[] = [];
  if (opts.userId) {
    where.push('user_id = ?');
    values.push(opts.userId);
  }
  if (opts.appointmentId) {
    where.push('appointment_id = ?');
    values.push(opts.appointmentId);
  }
  values.push(opts.limit ?? 100);

  const rows = getDb()
    .prepare(
      `SELECT * FROM payments${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...(values as any[])) as Row[];
  return rows.map(toPayment);
}

/** Net succeeded money in a window: charges minus refunds, in cents. */
export function revenueFromPayments(fromIso: string, toIso: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount_cents ELSE amount_cents END), 0) AS total
         FROM payments
        WHERE status = 'succeeded' AND created_at >= ? AND created_at < ?`
    )
    .get(fromIso, toIso) as { total: number };
  return Number(row.total);
}

/** Total actually collected against one appointment — drives the balance due. */
export function paidForAppointment(appointmentId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount_cents ELSE amount_cents END), 0) AS total
         FROM payments WHERE appointment_id = ? AND status = 'succeeded'`
    )
    .get(appointmentId) as { total: number };
  return Number(row.total);
}

// ── Invoices ─────────────────────────────────────────────────────────────────

function toInvoice(row: Row): Invoice {
  return {
    id: row.id,
    number: row.number,
    appointmentId: row.appointment_id ?? null,
    userId: row.user_id,
    lines: json<InvoiceLine[]>(row.lines, []),
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    taxCents: row.tax_cents,
    tipCents: row.tip_cents,
    totalCents: row.total_cents,
    status: row.status,
    issuedAt: row.issued_at ?? null,
    paidAt: row.paid_at ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Sequential per calendar year: MOD-2026-0001. Derived from a COUNT rather
 * than an auto-increment so the sequence restarts cleanly each January.
 *
 * ⚠️ Not safe under true concurrency — two simultaneous invoices could collide
 * on the UNIQUE index and one insert would fail. Acceptable for a single-
 * operator business; move to a dedicated counter table before multi-tenant use.
 */
function nextInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM invoices WHERE number LIKE ?`)
    .get(`MOD-${year}-%`) as { n: number };
  return `MOD-${year}-${String(Number(row.n) + 1).padStart(4, '0')}`;
}

export function createInvoice(input: {
  userId: string;
  appointmentId?: string | null;
  lines: InvoiceLine[];
  discountCents?: number;
  taxCents?: number;
  tipCents?: number;
  status?: Invoice['status'];
}): Invoice {
  const id = crypto.randomUUID();
  const subtotal = input.lines.reduce((sum, l) => sum + l.qty * l.unitCents, 0);
  const discount = input.discountCents ?? 0;
  const tax = input.taxCents ?? 0;
  const tip = input.tipCents ?? 0;
  const total = Math.max(0, subtotal - discount) + tax + tip;
  const status = input.status ?? 'draft';

  getDb()
    .prepare(
      `INSERT INTO invoices (id, number, appointment_id, user_id, lines, subtotal_cents,
                             discount_cents, tax_cents, tip_cents, total_cents, status, issued_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      nextInvoiceNumber(),
      input.appointmentId ?? null,
      input.userId,
      JSON.stringify(input.lines),
      subtotal,
      discount,
      tax,
      tip,
      total,
      status,
      status === 'draft' ? null : nowIso(),
      nowIso()
    );

  return getInvoice(id)!;
}

export function getInvoice(id: string): Invoice | null {
  const row = getDb().prepare(`SELECT * FROM invoices WHERE id = ?`).get(id) as Row | undefined;
  return row ? toInvoice(row) : null;
}

export function listInvoices(opts: { userId?: string; limit?: number } = {}): Invoice[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM invoices${opts.userId ? ' WHERE user_id = ?' : ''}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...([opts.userId, opts.limit ?? 100].filter((v) => v !== undefined) as any[])) as Row[];
  return rows.map(toInvoice);
}

/** Invoices raised against one appointment, newest first. */
export function listInvoicesForAppointment(appointmentId: string): Invoice[] {
  const rows = getDb()
    .prepare(`SELECT * FROM invoices WHERE appointment_id = ? ORDER BY created_at DESC`)
    .all(appointmentId) as Row[];
  return rows.map(toInvoice);
}

export function setInvoiceStatus(id: string, status: Invoice['status']): Invoice | null {
  getDb()
    .prepare(
      `UPDATE invoices SET status = ?,
              issued_at = COALESCE(issued_at, CASE WHEN ? != 'draft' THEN ? ELSE NULL END),
              paid_at   = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END
        WHERE id = ?`
    )
    .run(status, status, nowIso(), status, nowIso(), id);
  return getInvoice(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/invoices  — the caller's invoices
// POST /api/invoices  — raise one (managers+)
//
// Customers read their own; only management writes. An invoice is a statement of
// what is owed, so letting the person who owes it create or edit it would be
// nonsense — the scope check here is the whole point of the route.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, int, ok, str, withAuth } from '@/lib/api';
import { InvoiceLine } from '@/lib/models';
import { canManage } from '@/lib/rbac';
import { createInvoice, listInvoices } from '@/lib/repo/payments';
import { getAppointment } from '@/lib/repo/appointments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LINES = 40;

function parseLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  const out: InvoiceLine[] = [];
  for (const raw of value.slice(0, MAX_LINES)) {
    if (!raw || typeof raw !== 'object') continue;
    const l = raw as Record<string, unknown>;
    const label = str(l.label, 120);
    const qty = int(l.qty, 0);
    const unitCents = int(l.unitCents, 0);
    // Zero-quantity or negative lines would quietly change the total in ways
    // nobody reviewing the invoice would expect. Drop them.
    if (!label || qty <= 0 || unitCents < 0) continue;
    out.push({ label, qty, unitCents });
  }
  return out;
}

export const GET = withAuth('any', async ({ user, query }) => {
  const scopeUserId = canManage(user.role) ? str(query.get('user'), 60) || undefined : user.id;
  return NextResponse.json({
    ok: true,
    invoices: listInvoices({
      userId: scopeUserId,
      limit: Math.min(200, Number(query.get('limit')) || 100),
    }),
  });
});

export const POST = withAuth(
  'manager',
  async ({ body }) => {
    const b = (body ?? {}) as Record<string, unknown>;

    const userId = str(b.userId, 60);
    if (!userId) return fail('Choose a customer.', 400, { userId: 'Required.' });

    const lines = parseLines(b.lines);
    if (!lines.length) return fail('Add at least one line item.', 400, { lines: 'Required.' });

    const appointmentId = str(b.appointmentId, 60) || null;
    if (appointmentId && !getAppointment(appointmentId)) {
      return fail('That booking no longer exists.', 404);
    }

    const status = str(b.status, 20);
    const invoice = createInvoice({
      userId,
      appointmentId,
      lines,
      discountCents: Math.max(0, int(b.discountCents, 0)),
      taxCents: Math.max(0, int(b.taxCents, 0)),
      tipCents: Math.max(0, int(b.tipCents, 0)),
      status: status === 'sent' || status === 'paid' ? status : 'draft',
    });

    return ok({ invoice }, { status: 201 });
  },
  { limit: 'api' }
);

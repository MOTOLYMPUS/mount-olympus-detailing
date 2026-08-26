// ─────────────────────────────────────────────────────────────────────────────
// GET   /api/invoices/[id]  — one invoice (owner or management)
// PATCH /api/invoices/[id]  — change its status (managers+)
//
// Ownership is checked on the LOADED row rather than by adding a user filter to
// the URL, so there is no version of this request that returns a stranger's
// invoice. Status transitions are management-only for the same reason invoices
// are: the person who owes the money does not get to mark it paid.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, str, withAuth } from '@/lib/api';
import { Invoice } from '@/lib/models';
import { canManage } from '@/lib/rbac';
import { getInvoice, setInvoiceStatus } from '@/lib/repo/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: Invoice['status'][] = ['draft', 'sent', 'paid', 'void'];

export const GET = withAuth('any', async ({ user, params }) => {
  const invoice = getInvoice(params.id);
  // 404 rather than 403 for someone else's invoice — a 403 would confirm that
  // an invoice with that id exists.
  if (!invoice) return fail('Invoice not found.', 404);
  if (invoice.userId !== user.id && !canManage(user.role)) {
    return fail('Invoice not found.', 404);
  }
  return NextResponse.json({ ok: true, invoice });
});

export const PATCH = withAuth('manager', async ({ params, body }) => {
  const invoice = getInvoice(params.id);
  if (!invoice) return fail('Invoice not found.', 404);

  const status = str((body as Record<string, unknown> | null)?.status, 20) as Invoice['status'];
  if (!STATUSES.includes(status)) return fail('Unknown invoice status.', 400);

  return ok({ invoice: setInvoiceStatus(invoice.id, status) });
});

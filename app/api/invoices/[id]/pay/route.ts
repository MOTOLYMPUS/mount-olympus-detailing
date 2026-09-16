// ─────────────────────────────────────────────────────────────────────────────
// POST /api/invoices/:id/pay — the CUSTOMER pays their own invoice by card.
//
// Body: { tipCents?: number }. Returns a hosted Stripe Checkout URL; the tip,
// if any, is a second line item in the same session. The webhook is what
// marks the invoice paid — never the browser coming back to the success URL.
//
// Ownership: a customer may only pay an invoice raised to them. Managers may
// open a checkout for any invoice (paying on the customer's behalf at the
// counter with the customer's card on Stripe's page).
// ─────────────────────────────────────────────────────────────────────────────

import { fail, int, ok, withAuth } from '@/lib/api';
import { checkoutForInvoice } from '@/lib/invoicing';
import { canManage } from '@/lib/rbac';
import { getInvoice } from '@/lib/repo/payments';
import { getUser } from '@/lib/repo/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tips above this are almost certainly a typo. */
const MAX_TIP_CENTS = 100_000;

export const POST = withAuth(
  'any',
  async ({ user, params, body }) => {
    const invoice = getInvoice(params.id);
    // 404 for someone else's invoice, so the id is not confirmed to exist.
    if (!invoice || (invoice.userId !== user.id && !canManage(user.role))) {
      return fail('Invoice not found.', 404);
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const tipCents = int(b.tipCents, 0);
    if (tipCents < 0 || tipCents > MAX_TIP_CENTS) {
      return fail('Please enter a tip between $0 and $1,000.', 400, { tipCents: 'Invalid tip.' });
    }

    const customer = getUser(invoice.userId);
    if (!customer) return fail('Invoice not found.', 404);

    const result = await checkoutForInvoice(invoice, customer, tipCents);
    if (!result.ok) {
      return fail(result.message, result.reason === 'not-configured' ? 503 : 400);
    }
    return ok({ checkoutUrl: result.data.url, paymentId: result.data.paymentId });
  },
  { limit: 'api' }
);

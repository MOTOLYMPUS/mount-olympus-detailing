// ─────────────────────────────────────────────────────────────────────────────
// POST /api/invoices/[id]/charge — raise a Stripe Checkout link for an invoice.
//
// Managers+ only. Returns a hosted-checkout URL the owner sends to the client;
// card data never touches this app (no PCI scope). A PENDING payment row is
// created first and carries the invoice id in metadata, so the webhook both
// settles the payment AND flips the invoice to 'paid' with no manual step.
//
// The invoice is moved draft → sent here, because you cannot ask to be paid for
// something you have not issued.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, withAuth } from '@/lib/api';
import { siteUrl } from '@/lib/business';
import {
  createPayment,
  getInvoice,
  setInvoiceStatus,
  setPaymentStatus,
} from '@/lib/repo/payments';
import { getUser } from '@/lib/repo/users';
import { createCheckoutSession, stripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  'manager',
  async ({ params }) => {
    const invoice = getInvoice(params.id);
    if (!invoice) return fail('Invoice not found.', 404);

    if (invoice.status === 'paid') return fail('This invoice is already paid.', 409);
    if (invoice.status === 'void') return fail('This invoice was voided.', 409);
    if (invoice.totalCents <= 0) return fail('This invoice has no balance to charge.', 400);

    if (!stripeConfigured()) {
      return fail(
        'Card payments are not set up yet. Add your Stripe keys, or record a manual payment instead.',
        503
      );
    }

    const customer = getUser(invoice.userId);

    // Pending row FIRST, so the webhook always has something to reconcile even
    // if the client pays and the browser never returns.
    const payment = createPayment({
      appointmentId: invoice.appointmentId,
      userId: invoice.userId,
      kind: 'balance',
      amountCents: invoice.totalCents,
      status: 'pending',
      provider: 'stripe',
      methodLabel: 'Card',
    });

    const session = await createCheckoutSession({
      amountCents: invoice.totalCents,
      kind: 'balance',
      appointmentId: invoice.appointmentId,
      userId: invoice.userId,
      invoiceId: invoice.id,
      customerEmail: customer?.email,
      label: `Invoice ${invoice.number}`,
      successUrl: `${siteUrl}/?invoice=${invoice.number}&paid=1`,
      cancelUrl: `${siteUrl}/?invoice=${invoice.number}&cancelled=1`,
    });

    if (!session.ok) {
      return fail(session.message, session.reason === 'not-configured' ? 503 : 502);
    }

    // Persist the session id so the webhook finds this row by provider_ref;
    // move the invoice to 'sent' so it counts as outstanding, not an unsent
    // draft.
    setPaymentStatus(payment.id, 'pending', { providerRef: session.data.id });
    if (invoice.status === 'draft') setInvoiceStatus(invoice.id, 'sent');

    return ok({ checkoutUrl: session.data.url, paymentId: payment.id });
  },
  { limit: 'api' }
);

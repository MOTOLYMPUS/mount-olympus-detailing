// ─────────────────────────────────────────────────────────────────────────────
// POST /api/appointments/:id/invoice — "Complete & send invoice" (managers+).
//
// Marks the job complete (if it is not already), raises one invoice from the
// booking's services at the quoted price, and tells the customer where to pay.
// Idempotent: a second press returns the invoice that already stands.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, fail, ok, withAuth } from '@/lib/api';
import { completeAndInvoice } from '@/lib/invoicing';
import { stripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  'manager',
  async ({ user, params }) => {
    try {
      const { appointment, invoice, created } = await completeAndInvoice(params.id, user);
      return ok({ appointment, invoice, created, cardPayments: stripeConfigured() }, { status: created ? 201 : 200 });
    } catch (e) {
      if (e instanceof ApiError) return fail(e.message, e.status, e.fields);
      throw e;
    }
  },
  { limit: 'api' }
);

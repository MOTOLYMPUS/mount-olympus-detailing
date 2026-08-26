// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/payments  — payment history
// POST /api/payments  — start a Stripe Checkout session, or record a manual payment
//
// Two payment paths, deliberately:
//
//   'checkout' — Stripe Checkout, hosted on Stripe's domain. We create a pending
//                row, hand back a URL, and the WEBHOOK is what marks it paid.
//                Never the browser returning to the success URL — that is a
//                client-controlled redirect and a customer could simply visit it.
//
//   'manual'   — cash or Zelle, entered by a manager after the fact. This is the
//                fallback when Stripe is unconfigured, and it is MANAGERS+ ONLY
//                because it writes "money received" with no external evidence.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, int, ok, str, withAuth } from '@/lib/api';
import { siteUrl } from '@/lib/business';
import { PaymentKind } from '@/lib/models';
import { canManage } from '@/lib/rbac';
import { createPayment, listPayments, setPaymentStatus } from '@/lib/repo/payments';
import { getAppointment } from '@/lib/repo/appointments';
import { createCheckoutSession, stripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: PaymentKind[] = ['deposit', 'balance', 'tip', 'refund', 'membership'];

/** $1 minimum (below Stripe's own floor it would fail anyway) up to $50,000. */
const MIN_CENTS = 100;
const MAX_CENTS = 5_000_000;

export const GET = withAuth('any', async ({ user, query }) => {
  // Customers see only their own. A manager may look at one customer's history
  // by passing ?user=, which is the only way to widen the scope.
  const scopeUserId = canManage(user.role) ? str(query.get('user'), 60) || undefined : user.id;

  return NextResponse.json({
    ok: true,
    stripeConfigured: stripeConfigured(),
    payments: listPayments({
      userId: scopeUserId,
      appointmentId: str(query.get('appointment'), 60) || undefined,
      limit: Math.min(200, Number(query.get('limit')) || 100),
    }),
  });
});

export const POST = withAuth(
  'any',
  async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;

    const kind = str(b.kind, 20) as PaymentKind;
    if (!KINDS.includes(kind) || kind === 'refund') {
      return fail('Unknown payment type.', 400);
    }

    const amountCents = int(b.amountCents, 0);
    if (amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return fail('Enter an amount between $1 and $50,000.', 400, { amountCents: 'Invalid amount.' });
    }

    // If an appointment is named it must exist, and a customer may only pay for
    // their own — otherwise a stranger's booking could be credited (or probed).
    const appointmentId = str(b.appointmentId, 60) || null;
    if (appointmentId) {
      const appointment = getAppointment(appointmentId);
      if (!appointment) return fail('That booking no longer exists.', 404);
      if (!canManage(user.role) && appointment.customerId !== user.id) {
        return fail('You do not have access to that.', 403);
      }
    }

    const mode = str(b.mode, 20) || 'checkout';

    // ── Manual (cash / Zelle) ────────────────────────────────────────────────
    if (mode === 'manual') {
      if (!canManage(user.role)) {
        return fail('Only managers can record a manual payment.', 403);
      }
      const payment = createPayment({
        appointmentId,
        userId: str(b.userId, 60) || user.id,
        kind,
        amountCents,
        status: 'succeeded',
        provider: 'manual',
        methodLabel: str(b.methodLabel, 60) || 'Cash',
      });
      return ok({ payment, checkoutUrl: null }, { status: 201 });
    }

    // ── Stripe Checkout ──────────────────────────────────────────────────────
    if (!stripeConfigured()) {
      // Honest failure. The UI shows a "pay on the day" state rather than a
      // dead button, so this is a defensive backstop, not the normal path.
      return fail(
        'Card payments are not set up yet — you can settle up on the day, or call us to pay by phone.',
        503
      );
    }

    // The row is created PENDING first so a completed webhook always has
    // something to reconcile against, even if the browser never comes back.
    const payment = createPayment({
      appointmentId,
      userId: user.id,
      kind,
      amountCents,
      status: 'pending',
      provider: 'stripe',
      methodLabel: 'Card',
    });

    const session = await createCheckoutSession({
      amountCents,
      kind,
      appointmentId,
      userId: user.id,
      customerEmail: user.email,
      successUrl: `${siteUrl}/app/payments?paid=1`,
      cancelUrl: `${siteUrl}/app/payments?cancelled=1`,
    });

    if (!session.ok) {
      return fail(session.message, session.reason === 'not-configured' ? 503 : 502);
    }

    // Stamp the session id so the webhook can find this row. Written after the
    // session exists, because until then there is no id to write.
    setPaymentStatus(payment.id, 'pending', { providerRef: session.data.id });

    return ok(
      { payment: { ...payment, providerRef: session.data.id }, checkoutUrl: session.data.url },
      { status: 201 }
    );
  },
  { limit: 'api' }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook — Stripe calls this. No auth wrapper.
//
// This is the ONE route in the app with no withAuth(). Stripe has no session
// cookie and no user; the SIGNATURE is the authentication. Three rules make
// that safe, and breaking any of them makes the endpoint forgeable:
//
//  1. Read the RAW body with req.text() and verify BEFORE JSON.parse. The
//     signature covers the exact bytes Stripe sent — parse-and-re-stringify
//     changes them and every signature fails (or worse, tempts someone to skip
//     the check). withAuth is not used partly because its JSON parser would
//     consume the stream.
//  2. Reject anything that fails verifyWebhookSignature(), including the
//     5-minute replay window. See lib/stripe.ts for the scheme.
//  3. Be IDEMPOTENT. Stripe retries on any non-2xx and can deliver the same
//     event more than once even on success. Every handler below looks the
//     payment up by provider_ref first and returns early if it is already
//     settled — a double delivery must never double-credit an account.
//
// We always answer 200 for a *verified* event we simply do not handle, so
// Stripe stops retrying it. Only genuine failures return non-2xx.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import {
  createPayment,
  getInvoice,
  getPaymentByProviderRef,
  setInvoiceStatus,
  setPaymentStatus,
} from '@/lib/repo/payments';
import { notifyUser } from '@/lib/push';
import { verifyWebhookSignature, webhookSecret } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Raw bytes, before anything else touches them ──────────────────────
  const raw = await req.text();
  const signature = req.headers.get('stripe-signature');

  const verified = verifyWebhookSignature(raw, signature, webhookSecret());
  if (!verified.ok) {
    console.warn(`[stripe:webhook] rejected — ${verified.reason}`);
    // 400, not 401: Stripe treats any non-2xx as a failure and retries, and a
    // genuinely bad signature should never be retried into success anyway.
    return NextResponse.json({ ok: false, error: 'Invalid signature.' }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid payload.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'charge.refunded':
        handleChargeRefunded(event.data.object);
        break;
      case 'refund.updated':
        // Newer API versions no longer embed the refund list in the charge
        // payload, so this is the reliable signal. Idempotent with the above:
        // both key on the refund's own id.
        handleRefundUpdated(event.data.object);
        break;
      default:
        // Verified but uninteresting. 200 so Stripe stops delivering it.
        break;
    }
  } catch (e) {
    // Return 500 so Stripe retries — a transient DB failure should not silently
    // lose a payment.
    console.error(`[stripe:webhook] handler failed for ${event.type}`, e);
    return NextResponse.json({ ok: false, error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, received: event.type });
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Record<string, any>): Promise<void> {
  const sessionId = String(session.id ?? '');
  // The PaymentIntent is the durable object refunds reference later, so we
  // re-key the row onto it once it exists.
  const paymentIntent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  if (!sessionId) return;

  const metadata = (session.metadata ?? {}) as Record<string, string>;

  // Idempotency: check both keys, because a redelivery after we have already
  // re-keyed onto the PaymentIntent would otherwise look like a new payment.
  const existing =
    getPaymentByProviderRef(sessionId) ??
    (paymentIntent ? getPaymentByProviderRef(paymentIntent) : null);

  if (existing?.status === 'succeeded') return; // already settled — no-op

  const paid = session.payment_status === 'paid';
  if (!paid) return;

  if (existing) {
    setPaymentStatus(existing.id, 'succeeded', {
      ...(paymentIntent ? { providerRef: paymentIntent } : {}),
      methodLabel: 'Card',
    });
  } else {
    // No pending row — the session was created outside the normal POST flow (a
    // payment link, say). Record it from the metadata rather than dropping money
    // on the floor.
    createPayment({
      appointmentId: metadata.appointmentId || null,
      userId: metadata.userId || session.client_reference_id || null,
      kind: (metadata.kind as any) || 'balance',
      amountCents: Number(session.amount_total) || 0,
      status: 'succeeded',
      provider: 'stripe',
      providerRef: paymentIntent || sessionId,
      methodLabel: 'Card',
    });
  }

  // A tip added at checkout has its own pending row (lib/invoicing.ts); settle
  // it alongside the main payment. Idempotent: an already-succeeded row is
  // simply re-stamped succeeded.
  if (metadata.tipPaymentId) {
    setPaymentStatus(metadata.tipPaymentId, 'succeeded', {
      providerRef: `${paymentIntent || sessionId}:tip`,
      methodLabel: 'Card',
    });
  }

  // If this charge was raised against an invoice, mark it paid. setInvoiceStatus
  // is idempotent, so a redelivered event that reaches here is harmless.
  if (metadata.invoiceId) {
    const invoice = getInvoice(metadata.invoiceId);
    const wasPaid = invoice?.status === 'paid';
    setInvoiceStatus(metadata.invoiceId, 'paid');

    // First time only: thank the customer and invite the review that payment
    // has just unlocked.
    if (invoice && !wasPaid) {
      await notifyUser(invoice.userId, {
        kind: 'invoice.paid',
        title: 'Payment received — thank you',
        body: metadata.tipCents ? 'And thanks for the tip! How did we do?' : 'How did we do? Leave a quick review.',
        url: invoice.appointmentId ? `/app/appointments/${invoice.appointmentId}` : '/app/payments',
      });
    }
  }
}

/** One refund object, from `refund.updated`. Recorded once it has succeeded. */
function handleRefundUpdated(refund: Record<string, any>): void {
  const refundId = String(refund.id ?? '');
  if (!refundId || refund.status !== 'succeeded') return;
  if (getPaymentByProviderRef(refundId)) return; // already recorded

  const paymentIntent =
    typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : (refund.payment_intent?.id ?? null);
  const original = paymentIntent ? getPaymentByProviderRef(paymentIntent) : null;

  createPayment({
    appointmentId: original?.appointmentId ?? null,
    userId: original?.userId ?? null,
    kind: 'refund',
    amountCents: Number(refund.amount) || 0,
    status: 'succeeded',
    provider: 'stripe',
    providerRef: refundId,
    methodLabel: 'Card refund',
  });
}

function handleChargeRefunded(charge: Record<string, any>): void {
  const paymentIntent =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);

  const refunds: Record<string, any>[] = charge.refunds?.data ?? [];
  const original = paymentIntent ? getPaymentByProviderRef(paymentIntent) : null;

  for (const refund of refunds) {
    const refundId = String(refund.id ?? '');
    if (!refundId) continue;

    // The refund's own id is the idempotency key. A partial refund followed by
    // another partial refund is two legitimate rows; a redelivery of the same
    // one is not.
    if (getPaymentByProviderRef(refundId)) continue;

    // A separate negative-intent row, never a mutation of the original charge —
    // the ledger in lib/repo/payments.ts is append-only by design.
    createPayment({
      appointmentId: original?.appointmentId ?? null,
      userId: original?.userId ?? null,
      kind: 'refund',
      amountCents: Number(refund.amount) || 0,
      status: 'succeeded',
      provider: 'stripe',
      providerRef: refundId,
      methodLabel: 'Card refund',
    });
  }
}

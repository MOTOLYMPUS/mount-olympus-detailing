// ─────────────────────────────────────────────────────────────────────────────
// Stripe, over plain `fetch`.
//
// Same shape as lib/notify.ts: the provider is called with fetch and form-
// encoded bodies, there is no SDK, and missing configuration DEGRADES rather
// than throws. With no STRIPE_SECRET_KEY every function returns a
// `not-configured` result and the caller falls back to recording a MANUAL
// payment — cash or Zelle — which lib/repo/payments.ts already models via the
// `provider` column. The books stay complete either way.
//
// ⚠️ PCI: this file NEVER sees a card number. Stripe Checkout is a HOSTED page
// on Stripe's domain; we create a session and redirect. Card data never touches
// this server, this database, or this network, which is what keeps the business
// in SAQ-A scope instead of the full SAQ-D questionnaire that applies to anyone
// who transmits raw PANs. Do not add a card form to this app.
//
// Required env vars — see .env.example:
//   STRIPE_SECRET_KEY        sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET    whsec_…   (only needed by the webhook route)
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { PaymentKind } from './models';

const API_BASE = 'https://api.stripe.com/v1';

/** Pinned so a Stripe API upgrade can never silently change response shapes. */
const STRIPE_API_VERSION = '2024-06-20';

const secretKey = () => process.env.STRIPE_SECRET_KEY?.trim();
export const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET?.trim();

export function stripeConfigured(): boolean {
  return !!secretKey();
}

const TIMEOUT_MS = 20_000;

// ── Result type ──────────────────────────────────────────────────────────────

/**
 * Every call returns this rather than throwing, so a route handler's happy path
 * and its degraded path are the same shape. `not-configured` is a first-class
 * outcome, not an error.
 */
export type StripeResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'not-configured' | 'error'; message: string };

const notConfigured = <T>(fn: string): StripeResult<T> => {
  console.warn(`[stripe] ${fn} skipped — STRIPE_SECRET_KEY not set. Falling back to manual payment.`);
  return { ok: false, reason: 'not-configured', message: 'Card payments are not set up.' };
};

// ── Transport ────────────────────────────────────────────────────────────────

/**
 * Stripe's REST API is form-encoded, including nested structures, which it
 * expresses as `a[b][c]=v`. Arrays are indexed: `line_items[0][price]`.
 */
function encode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    const field = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === 'object') {
          out.push(...encode(item as Record<string, unknown>, `${field}[${i}]`));
        } else {
          out.push(`${encodeURIComponent(`${field}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === 'object') {
      out.push(...encode(value as Record<string, unknown>, field));
    } else {
      out.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return out;
}

async function call<T>(
  path: string,
  method: 'GET' | 'POST',
  params: Record<string, unknown> = {},
  fnName = path
): Promise<StripeResult<T>> {
  if (!stripeConfigured()) return notConfigured<T>(fnName);

  const body = encode(params).join('&');
  const url = method === 'GET' && body ? `${API_BASE}${path}?${body}` : `${API_BASE}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Stripe-Version': STRIPE_API_VERSION,
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(method === 'POST' ? { body } : {}),
      signal: controller.signal,
    });

    const json = (await res.json()) as any;
    if (!res.ok) {
      const message = json?.error?.message ?? `Stripe ${res.status}`;
      console.error(`[stripe] ${fnName} failed: ${message}`);
      return { ok: false, reason: 'error', message };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    console.error(`[stripe] ${fnName} ${aborted ? 'timed out' : 'threw'}`, e);
    return {
      ok: false,
      reason: 'error',
      message: aborted ? 'The payment provider timed out.' : 'The payment provider is unavailable.',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export interface CheckoutSession {
  id: string;
  url: string | null;
  payment_status?: string;
  amount_total?: number | null;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutInput {
  amountCents: number;
  kind: PaymentKind;
  appointmentId?: string | null;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  /** Shown on the hosted page and on the customer's statement descriptor line. */
  label?: string;
  customerEmail?: string;
}

const KIND_LABEL: Record<PaymentKind, string> = {
  deposit: 'Booking deposit',
  balance: 'Balance due',
  tip: 'Tip',
  refund: 'Refund',
  membership: 'Membership',
};

/**
 * Create a hosted Checkout Session and hand back its URL. The IDs we care about
 * later ride in `metadata` so the webhook can reconcile the payment without
 * trusting anything the browser sends back on the success URL.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput
): Promise<StripeResult<CheckoutSession>> {
  if (input.amountCents <= 0) {
    return { ok: false, reason: 'error', message: 'Amount must be greater than zero.' };
  }

  return call<CheckoutSession>(
    '/checkout/sessions',
    'POST',
    {
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      customer_email: input.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: input.amountCents,
            product_data: { name: input.label || KIND_LABEL[input.kind] },
          },
        },
      ],
      metadata: {
        kind: input.kind,
        userId: input.userId,
        appointmentId: input.appointmentId ?? '',
      },
    },
    'createCheckoutSession'
  );
}

export async function retrieveSession(id: string): Promise<StripeResult<CheckoutSession>> {
  return call<CheckoutSession>(`/checkout/sessions/${encodeURIComponent(id)}`, 'GET', {}, 'retrieveSession');
}

// ── Refunds ──────────────────────────────────────────────────────────────────

export interface Refund {
  id: string;
  amount: number;
  status: string;
  payment_intent: string;
}

/**
 * Partial refund when `amountCents` is given, full refund otherwise. The
 * resulting ledger row is written by the caller as a separate negative-intent
 * payment — lib/repo/payments.ts never mutates the original charge.
 */
export async function createRefund(
  paymentIntentId: string,
  amountCents?: number
): Promise<StripeResult<Refund>> {
  return call<Refund>(
    '/refunds',
    'POST',
    {
      payment_intent: paymentIntentId,
      ...(amountCents && amountCents > 0 ? { amount: amountCents } : {}),
    },
    'createRefund'
  );
}

// ── Webhook signature verification ───────────────────────────────────────────

export interface VerifiedWebhook {
  ok: boolean;
  reason?: 'no-secret' | 'malformed-header' | 'bad-signature' | 'timestamp-out-of-tolerance';
}

/** Stripe's documented replay window. Anything older is refused outright. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a `Stripe-Signature` header per Stripe's scheme, using node:crypto —
 * no SDK required.
 *
 * The header looks like: `t=1699999999,v1=abc…,v1=def…`
 *   1. Parse out `t` and every `v1` (Stripe sends more than one during a secret
 *      rotation, so ANY match is a pass).
 *   2. The signed payload is literally `${t}.${rawBody}` — which is why the
 *      route MUST read `await req.text()` and verify BEFORE JSON.parse. Parsing
 *      and re-stringifying changes the bytes and every signature fails.
 *   3. Compare with timingSafeEqual, not `===`. A byte-by-byte early-exit
 *      comparison leaks the correct prefix through timing.
 *   4. Reject timestamps outside a 5-minute tolerance. Without this check a
 *      captured, still-validly-signed request could be replayed forever and
 *      charge or credit an account repeatedly.
 */
export function verifyWebhookSignature(
  payload: string,
  sigHeader: string | null,
  secret: string | undefined
): VerifiedWebhook {
  if (!secret) {
    console.warn('[stripe] webhook received but STRIPE_WEBHOOK_SECRET is not set — rejecting.');
    return { ok: false, reason: 'no-secret' };
  }
  if (!sigHeader) return { ok: false, reason: 'malformed-header' };

  let timestamp = '';
  const signatures: string[] = [];

  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { ok: false, reason: 'malformed-header' };
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (age > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp-out-of-tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  const matched = signatures.some((sig) => {
    const candidate = Buffer.from(sig, 'utf8');
    // timingSafeEqual throws on a length mismatch, so guard first. Length is
    // not secret — every valid hex SHA-256 is the same 64 characters.
    if (candidate.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(candidate, expectedBuf);
  });

  return matched ? { ok: true } : { ok: false, reason: 'bad-signature' };
}

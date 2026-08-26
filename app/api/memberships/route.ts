// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/memberships — the plans on offer plus the caller's current one
// POST /api/memberships — subscribe, or cancel
//
// Routes through Stripe Checkout when configured; otherwise records a MANUAL
// membership so the business can still sell a plan and take payment off-platform
// — the same degradation the payments route uses, for the same reason.
//
// ⚠️ Stripe here is a one-off Checkout charge, not a Stripe Subscription. The
// renewal date is stored locally and NOTHING bills it automatically. See the
// note on `renewsAt` below before turning this on for real recurring revenue.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, str, withAuth } from '@/lib/api';
import { siteUrl } from '@/lib/business';
import {
  activeMembership,
  cancelMembership,
  createMembership,
  listPlans,
} from '@/lib/repo/loyalty';
import { createPayment, setPaymentStatus } from '@/lib/repo/payments';
import { createCheckoutSession, stripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Advance a date by the plan's interval. Monthly is the only one billed today. */
function renewalDate(interval: string): string {
  const d = new Date();
  if (interval === 'year' || interval === 'yearly' || interval === 'annual') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}

export const GET = withAuth('any', async ({ user }) => {
  return NextResponse.json({
    ok: true,
    plans: listPlans(true),
    current: activeMembership(user.id),
    stripeConfigured: stripeConfigured(),
  });
});

export const POST = withAuth(
  'any',
  async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const action = str(b.action, 20) || 'subscribe';

    if (action === 'cancel') {
      const current = activeMembership(user.id);
      if (!current) return fail('You do not have an active membership.', 404);
      cancelMembership(current.id);
      return ok({ cancelled: current.id });
    }

    const planId = str(b.planId, 60);
    const plan = listPlans(true).find((p) => p.id === planId);
    if (!plan) return fail('That plan is no longer available.', 404);

    // One at a time. Stacking plans would make the discount ambiguous and the
    // renewal dates meaningless.
    if (activeMembership(user.id)) {
      return fail('You already have an active membership. Cancel it first to switch plans.', 409);
    }

    // ── Stripe unconfigured: manual membership, activated immediately ────────
    if (!stripeConfigured()) {
      const membership = createMembership({
        userId: user.id,
        planId: plan.id,
        renewsAt: renewalDate(plan.interval),
        providerRef: null,
      });
      createPayment({
        userId: user.id,
        kind: 'membership',
        amountCents: plan.priceCents,
        status: 'pending',
        provider: 'manual',
        methodLabel: 'Pay on the day',
      });
      return ok({ membership, checkoutUrl: null, manual: true }, { status: 201 });
    }

    // ── Stripe Checkout ──────────────────────────────────────────────────────
    const payment = createPayment({
      userId: user.id,
      kind: 'membership',
      amountCents: plan.priceCents,
      status: 'pending',
      provider: 'stripe',
      methodLabel: 'Card',
    });

    const session = await createCheckoutSession({
      amountCents: plan.priceCents,
      kind: 'membership',
      userId: user.id,
      customerEmail: user.email,
      label: `${plan.name} membership`,
      successUrl: `${siteUrl}/app/rewards?joined=1`,
      cancelUrl: `${siteUrl}/app/rewards?cancelled=1`,
    });

    if (!session.ok) return fail(session.message, 502);
    setPaymentStatus(payment.id, 'pending', { providerRef: session.data.id });

    // The membership row is created up front and carries the session id, so the
    // customer's plan is visible immediately and the webhook only has to settle
    // the money. If they abandon Checkout, the pending payment is the record of
    // that — it is never marked succeeded.
    const membership = createMembership({
      userId: user.id,
      planId: plan.id,
      renewsAt: renewalDate(plan.interval),
      providerRef: session.data.id,
    });

    return ok({ membership, checkoutUrl: session.data.url, manual: false }, { status: 201 });
  },
  { limit: 'api' }
);

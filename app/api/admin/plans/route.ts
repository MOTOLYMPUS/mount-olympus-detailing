// ─────────────────────────────────────────────────────────────────────────────
// GET/POST /api/admin/plans — membership plans.
//
// The settings brief calls for plan editing through `upsertPlan`, and a form
// with no endpoint behind it is worse than no form: it looks like it saved.
// So this route exists alongside settings/holidays/service-areas.
//
// A PLAN'S DISCOUNT IS REAL MONEY. `priceBooking` in lib/booking.ts takes the
// LARGER of the membership discount and the loyalty-tier discount — never both
// — so a plan set to 90% quietly discounts every booking a member makes, for
// as long as the plan exists. The percentage is therefore clamped to 0–50 here
// rather than 0–100: anything past half price is far likelier to be a typo than
// an intention, and the failure mode is silent.
//
// Like service areas, there is no DELETE. Retiring a plan (`active: false`)
// keeps existing memberships and their historical discounts intelligible.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, int, ok, str, stringArray, withAuth } from '@/lib/api';
import { listPlans, membershipStats, upsertPlan } from '@/lib/repo/loyalty';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERVALS = ['month', 'quarter', 'year'];

export const GET = withAuth('manager', async () => {
  return NextResponse.json({ ok: true, plans: listPlans(false), stats: membershipStats() });
});

export const POST = withAuth('admin', async ({ user, body, ipHash }) => {
  const b = (body ?? {}) as Record<string, unknown>;

  const id = str(b.id, 60) || undefined;
  if (id && !listPlans(false).some((p) => p.id === id)) {
    return fail('That plan no longer exists.', 404);
  }

  const name = str(b.name, 120);
  if (!name) return fail('Give the plan a name.', 400, { name: 'What is it called?' });

  const interval = str(b.interval, 20) || 'month';
  if (!INTERVALS.includes(interval)) {
    return fail(`Interval must be one of: ${INTERVALS.join(', ')}.`, 400, { interval: 'Not valid.' });
  }

  const discountPct = int(b.discountPct, 0);
  if (discountPct < 0 || discountPct > 50) {
    return fail('A membership discount must be between 0 and 50 percent.', 400, {
      discountPct: 'Between 0 and 50.',
    });
  }

  const plan = upsertPlan({
    id,
    name,
    description: str(b.description, 500),
    priceCents: Math.min(1_000_000, Math.max(0, int(b.priceCents, 0))),
    interval,
    discountPct,
    included: stringArray(b.included, 20, 120),
    active: b.active !== false,
  });

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'membership_plan',
    entityId: plan.id,
    meta: { name: plan.name, discountPct: plan.discountPct, created: !id },
    ipHash,
  });

  return ok({ plan, plans: listPlans(false) }, { status: id ? 200 : 201 });
});

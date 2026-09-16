// ─────────────────────────────────────────────────────────────────────────────
// /app/rewards — points, tier, referral code, and membership plans.
//
// The ledger is rendered straight from listLoyaltyEvents rather than from the
// cached balance alone. That is the point of the event log in lib/repo/loyalty.ts:
// "why do I have 340 points?" has to be answerable on screen, or the programme
// reads as arbitrary and nobody trusts it.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { CopyReferral, PlanActions } from '@/components/app/RewardsActions';
import { Card, CardTitle, EmptyState, Field, PageHeader, StatTile } from '@/components/ui';
import { siteUrl } from '@/lib/business';
import { requirePage } from '@/lib/guards';
import { LOYALTY_TIERS, REFERRAL_DISCOUNT_PERCENT, TIER_DISCOUNT, TIER_THRESHOLDS } from '@/lib/models';
import {
  activeMembership,
  ensureLoyaltyAccount,
  listLoyaltyEvents,
  listPlans,
} from '@/lib/repo/loyalty';
import { couponLabel, listCoupons } from '@/lib/repo/coupons';
import { stripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rewards',
  robots: { index: false, follow: false },
};

const TIER_LABEL: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

export default async function RewardsPage() {
  const user = await requirePage('/app/rewards');

  // Idempotent — a customer who registered before the programme existed gets an
  // account on first visit rather than an empty screen.
  const account = ensureLoyaltyAccount(user.id);
  const events = listLoyaltyEvents(user.id, 50);
  const plans = listPlans(true);
  const membership = activeMembership(user.id);
  const coupons = listCoupons(user.id);
  const availableCoupons = coupons.filter((c) => c.status === 'available');
  const pendingReferrals = coupons.filter((c) => c.kind === 'referral' && c.status === 'pending');

  const tierIndex = LOYALTY_TIERS.indexOf(account.tier);
  const nextTier = LOYALTY_TIERS[tierIndex + 1] ?? null;
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null;
  const currentThreshold = TIER_THRESHOLDS[account.tier];

  // Progress within the CURRENT band, not from zero — otherwise a platinum
  // customer's bar sits at 100% forever and tells them nothing.
  const progressPct = nextThreshold
    ? Math.min(
        100,
        Math.max(
          0,
          ((account.lifetimePoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100
        )
      )
    : 100;

  const referralLink = `${siteUrl}/register?ref=${account.referralCode}`;

  return (
    <>
      <PageHeader
        eyebrow="Loyalty"
        title="Rewards"
        description="Points on every completed job, a one-time coupon at every tier you reach, and 10% off for you and everyone you send our way."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Points balance" value={String(account.points)} sub="Available to redeem" />
        <StatTile
          label="Tier"
          value={TIER_LABEL[account.tier] ?? account.tier}
          sub={
            availableCoupons.length > 0
              ? `${availableCoupons.length} coupon${availableCoupons.length === 1 ? '' : 's'} ready to use`
              : 'Reach the next tier for a coupon'
          }
        />
        <StatTile
          label="Lifetime points"
          value={String(account.lifetimePoints)}
          sub="Never decreases"
        />
      </div>

      {/* ── Progress ────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardTitle>Progress</CardTitle>
        {nextTier && nextThreshold ? (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-sm text-white">
                {nextThreshold - account.lifetimePoints} points to {TIER_LABEL[nextTier]}
              </span>
              <span className="font-mono text-[12px] text-subtle">
                {TIER_DISCOUNT[nextTier]}% coupon at {TIER_LABEL[nextTier]}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/5"
              role="progressbar"
              aria-valuenow={Math.round(progressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress to ${TIER_LABEL[nextTier]}`}
            >
              <div className="h-full rounded-full bg-apex" style={{ width: `${progressPct}%` }} />
            </div>
          </>
        ) : (
          <p className="py-2 text-sm text-muted">
            You are at the top tier. Every tier you reached earned a one-time coupon — see
            yours below.
          </p>
        )}
      </Card>

      {/* ── Coupons ─────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardTitle
          action={
            <span className="font-mono text-[11px] text-muted">
              {availableCoupons.length} ready
            </span>
          }
        >
          Your coupons
        </CardTitle>
        <p className="mb-4 text-sm text-muted">
          Each tier you reach and each friend you refer earns a one-time percentage off a
          booking. Coupons never expire; the best one you have is applied automatically to your
          next booking.
        </p>
        {coupons.length === 0 ? (
          <p className="py-2 text-sm text-subtle">
            No coupons yet — reach {TIER_LABEL.silver} ({TIER_THRESHOLDS.silver} lifetime points)
            for your first {TIER_DISCOUNT.silver}% coupon, or refer a friend.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {coupons.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white">{couponLabel(c)}</p>
                  <p className="text-[12px] text-subtle">
                    {c.status === 'available' && 'Ready — applied to your next booking'}
                    {c.status === 'pending' && 'Unlocks when your friend adds a vehicle or books'}
                    {c.status === 'used' &&
                      `Used${c.usedAt ? ` on ${new Date(c.usedAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}`}
                  </p>
                </div>
                <span
                  className={
                    c.status === 'available'
                      ? 'shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest2 text-emerald-300'
                      : c.status === 'pending'
                        ? 'shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest2 text-amber-200'
                        : 'shrink-0 rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest2 text-subtle'
                  }
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Referrals ───────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardTitle>Refer a friend</CardTitle>
        <p className="mb-4 text-sm text-muted">
          Share your code. Your friend gets {REFERRAL_DISCOUNT_PERCENT}% off their first booking
          the moment they sign up with it, and you get a {REFERRAL_DISCOUNT_PERCENT}% coupon once
          they add a vehicle or book a service.
          {pendingReferrals.length > 0 &&
            ` ${pendingReferrals.length} referral${pendingReferrals.length === 1 ? ' is' : 's are'} waiting on that step.`}
        </p>
        <CopyReferral code={account.referralCode} link={referralLink} />
        <p className="mt-3 break-all font-mono text-[11px] text-subtle">{referralLink}</p>
      </Card>

      {/* ── Memberships ─────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardTitle>Membership plans</CardTitle>
        {membership && (
          <dl className="mb-4">
            <Field label="Current plan">{membership.plan.name}</Field>
            <Field label="Discount">{membership.plan.discountPct}%</Field>
            <Field label="Renews">
              {membership.renewsAt
                ? new Date(membership.renewsAt).toLocaleDateString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '—'}
            </Field>
          </dl>
        )}
        {plans.length === 0 ? (
          <p className="py-2 text-sm text-muted">No plans on offer right now.</p>
        ) : (
          <PlanActions
            plans={plans}
            currentPlanId={membership?.planId ?? null}
            stripeConfigured={stripeConfigured()}
          />
        )}
      </Card>

      {/* ── Ledger ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Points history</CardTitle>
        {events.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Points land here after each completed service. Referral rewards are coupons, listed above."
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-white">{e.note || e.kind}</p>
                  <p className="text-[12px] text-subtle">
                    {new Date(e.createdAt).toLocaleDateString([], {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {e.kind}
                  </p>
                </div>
                <span
                  className={
                    e.points >= 0
                      ? 'shrink-0 font-mono text-sm text-emerald-400'
                      : 'shrink-0 font-mono text-sm text-amber-400'
                  }
                >
                  {e.points >= 0 ? '+' : ''}
                  {e.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

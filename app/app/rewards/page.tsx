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
import { LOYALTY_TIERS, TIER_DISCOUNT, TIER_THRESHOLDS } from '@/lib/models';
import {
  activeMembership,
  ensureLoyaltyAccount,
  listLoyaltyEvents,
  listPlans,
} from '@/lib/repo/loyalty';
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
        description="Points on every completed job, a standing discount as you move up, and credit for everyone you send our way."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Points balance" value={String(account.points)} sub="Available to redeem" />
        <StatTile
          label="Tier"
          value={TIER_LABEL[account.tier] ?? account.tier}
          sub={
            TIER_DISCOUNT[account.tier] > 0
              ? `${TIER_DISCOUNT[account.tier]}% off every service`
              : 'No discount yet'
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
                {TIER_DISCOUNT[nextTier]}% off at {TIER_LABEL[nextTier]}
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
            You are at the top tier — {TIER_DISCOUNT[account.tier]}% off every service.
          </p>
        )}
      </Card>

      {/* ── Referrals ───────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardTitle>Refer a friend</CardTitle>
        <p className="mb-4 text-sm text-muted">
          Share your code. When someone registers with it, you both get points.
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
            description="Points land here after your first completed service, or when someone uses your referral code."
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

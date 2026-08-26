'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The two interactive bits of the rewards screen: the referral-code copy button
// and the "start a plan" buttons.
//
// Split out from the page so the rest of /app/rewards stays a server component —
// the points ledger and tier maths never reach the browser bundle.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { MembershipPlan } from '@/lib/models';
import { buttonClass } from '@/components/ui';

export function CopyReferral({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). The
      // code is printed next to the button, so there is always a manual path.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <code className="rounded-sm border border-white/15 bg-black/30 px-3 py-2 font-mono text-lg tracking-widest2 text-white">
        {code}
      </code>
      <button type="button" onClick={copy} className={buttonClass('secondary', 'sm')}>
        {copied ? 'Copied' : 'Copy invite link'}
      </button>
      {/* aria-live so the confirmation is announced, not just seen. */}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? 'Invite link copied to clipboard.' : ''}
      </span>
    </div>
  );
}

export function PlanActions({
  plans,
  currentPlanId,
  stripeConfigured,
}: {
  plans: MembershipPlan[];
  currentPlanId: string | null;
  stripeConfigured: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function subscribe(planId: string) {
    setBusy(planId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Could not start that plan.');

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      // Manual path: the plan is active, payment is arranged off-platform.
      setNotice('Your plan is active. We will arrange payment with you directly.');
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-2">
        {plans.map((plan) => {
          const active = plan.id === currentPlanId;
          return (
            <li
              key={plan.id}
              className="rounded-sm border border-white/10 bg-charcoal/40 p-4"
            >
              <p className="font-display text-base font-semibold text-white">{plan.name}</p>
              <p className="mt-1 font-mono text-sm text-flare">
                ${(plan.priceCents / 100).toFixed(0)}/{plan.interval}
                {plan.discountPct > 0 && (
                  <span className="ml-2 text-subtle">· {plan.discountPct}% off services</span>
                )}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{plan.description}</p>
              {plan.included.length > 0 && (
                <ul className="mt-2 space-y-1 text-[12px] text-subtle">
                  {plan.included.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => subscribe(plan.id)}
                disabled={active || busy !== null}
                className={buttonClass(active ? 'secondary' : 'primary', 'sm', 'mt-4 w-full')}
              >
                {active ? 'Your current plan' : busy === plan.id ? 'Starting…' : 'Start this plan'}
              </button>
            </li>
          );
        })}
      </ul>

      {!stripeConfigured && (
        <p className="text-[12px] text-subtle">
          Card payments are not set up yet — start a plan and we will arrange payment with you
          directly.
        </p>
      )}
      {notice && (
        <p role="status" className="text-[13px] text-emerald-400">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-flare">
          {error}
        </p>
      )}
    </div>
  );
}

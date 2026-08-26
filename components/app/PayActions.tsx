'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The Pay / Add tip buttons.
//
// A client component only because it POSTs and then redirects to Stripe. When
// Stripe is unconfigured this component is not rendered at all — the page shows
// an honest "settle up on the day" state instead of a button that cannot work.
// A dead button is worse than no button: it makes the customer think they paid.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { buttonClass } from '@/components/ui';

export default function PayActions({
  balanceCents,
  appointmentId,
}: {
  balanceCents: number;
  appointmentId: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState('20');

  async function start(kind: 'balance' | 'tip', amountCents: number) {
    if (amountCents <= 0) return;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, amountCents, appointmentId, mode: 'checkout' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? 'Could not start the payment.');

      if (data.checkoutUrl) {
        // Full navigation, not a fetch: Checkout is a hosted page on Stripe's
        // own domain, which is exactly what keeps card data off this server.
        window.location.href = data.checkoutUrl;
        return;
      }
      throw new Error('The payment provider did not return a checkout link.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {balanceCents > 0 && (
          <button
            type="button"
            onClick={() => start('balance', balanceCents)}
            disabled={busy !== null}
            className={buttonClass('primary', 'sm')}
          >
            {busy === 'balance' ? 'Opening…' : `Pay $${(balanceCents / 100).toFixed(2)}`}
          </button>
        )}

        <label htmlFor="tip-amount" className="sr-only">
          Tip amount in dollars
        </label>
        <input
          id="tip-amount"
          type="number"
          min={1}
          max={500}
          value={tip}
          onChange={(e) => setTip(e.target.value)}
          className="w-20 rounded-sm border border-white/15 bg-black/30 px-2.5 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => start('tip', Math.round(Number(tip) * 100))}
          disabled={busy !== null || !(Number(tip) > 0)}
          className={buttonClass('secondary', 'sm')}
        >
          {busy === 'tip' ? 'Opening…' : 'Add tip'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-flare">
          {error}
        </p>
      )}
    </div>
  );
}

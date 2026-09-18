'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Pay an invoice by card, with a tip.
//
// Tip choices are 10 / 15 / 20 percent of the invoice total, a custom dollar
// amount, or none. Whatever is chosen rides in the same Stripe Checkout as a
// second line item, so the customer pays once. Card data never touches this
// app: Checkout is a hosted page on Stripe's domain.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import clsx from 'clsx';
import { buttonClass } from '@/components/ui';

const PRESETS = [10, 15, 20] as const;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function InvoicePay({
  invoiceId,
  totalCents,
  number,
}: {
  invoiceId: string;
  totalCents: number;
  number: string;
}) {
  const [choice, setChoice] = useState<'none' | 10 | 15 | 20 | 'custom'>(15);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tipCents =
    choice === 'none'
      ? 0
      : choice === 'custom'
        ? Math.max(0, Math.round((Number(custom) || 0) * 100))
        : Math.round((totalCents * choice) / 100);

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipCents }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? 'Could not start the payment.');
      }
      // Full navigation to Stripe's hosted page.
      window.location.href = data.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  const pill = (active: boolean) =>
    clsx(
      'rounded-sm border px-3 py-2 text-sm transition-colors',
      active ? 'border-apex bg-apex/10 text-white' : 'border-white/20 text-muted hover:border-white/45 hover:text-white'
    );

  return (
    <div className="space-y-4">
      {/* Tip choices, centred */}
      <div className="text-center">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
          Add a tip for your technician
        </p>
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Tip">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setChoice(p)} className={pill(choice === p)}>
              {p}% <span className="text-subtle">· {money(Math.round((totalCents * p) / 100))}</span>
            </button>
          ))}
          <button type="button" onClick={() => setChoice('custom')} className={pill(choice === 'custom')}>
            Custom
          </button>
          <button type="button" onClick={() => setChoice('none')} className={pill(choice === 'none')}>
            No tip
          </button>
        </div>
        {choice === 'custom' && (
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-muted">
            $
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step="1"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="input-field w-28"
              aria-label="Custom tip in dollars"
              placeholder="0"
            />
          </label>
        )}
        {tipCents > 0 && (
          <p className="mt-3 text-sm text-muted">
            Invoice {number} {money(totalCents)} + tip {money(tipCents)}
          </p>
        )}
      </div>

      {/* Pay button spans the card */}
      <button type="button" disabled={busy} onClick={pay} className={buttonClass('primary', 'md', 'w-full')}>
        {busy ? 'Opening…' : `Pay ${money(totalCents + tipCents)}`}
      </button>

      {error && (
        <p role="alert" className="text-center text-[13px] text-flare">
          {error}
        </p>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { EstimateResult } from '@/lib/types';
import { formatCurrency } from '@/lib/pricing';

interface Props {
  estimate: EstimateResult;
  depositOnly: boolean;
  onDepositOnlyChange: (v: boolean) => void;
  onPay: () => void;
  onBack: () => void;
  processing: boolean;
}

export default function StepPayment({
  estimate,
  depositOnly,
  onDepositOnlyChange,
  onPay,
  onBack,
  processing,
}: Props) {
  const [method, setMethod] = useState<'card' | 'apple' | 'google'>('card');
  const amountDue = depositOnly ? estimate.depositRequired : estimate.estimatedPrice;

  return (
    <div>
      <h3 className="font-display text-2xl font-bold">Secure your appointment</h3>
      <p className="mt-2 text-sm text-smoke/50">
        A deposit holds your slot. The remaining balance is due at pickup.
      </p>

      <div className="mt-7 flex gap-2.5">
        <button
          onClick={() => onDepositOnlyChange(true)}
          className={`flex-1 rounded-sm border px-4 py-3 text-left transition-colors duration-200 ${
            depositOnly ? 'border-apex bg-apex/5' : 'border-white/15'
          }`}
        >
          <p className="font-mono text-[11px] uppercase tracking-widest2 text-smoke/50">
            Pay Deposit
          </p>
          <p className="mt-1 text-lg text-white">{formatCurrency(estimate.depositRequired)}</p>
        </button>
        <button
          onClick={() => onDepositOnlyChange(false)}
          className={`flex-1 rounded-sm border px-4 py-3 text-left transition-colors duration-200 ${
            !depositOnly ? 'border-apex bg-apex/5' : 'border-white/15'
          }`}
        >
          <p className="font-mono text-[11px] uppercase tracking-widest2 text-smoke/50">
            Pay in Full
          </p>
          <p className="mt-1 text-lg text-white">{formatCurrency(estimate.estimatedPrice)}</p>
        </button>
      </div>

      {depositOnly && (
        <p className="mt-2 font-mono text-[11px] text-smoke/40">
          Remaining balance of {formatCurrency(estimate.estimatedPrice - estimate.depositRequired)} due
          at pickup.
        </p>
      )}

      <p className="eyebrow mb-3 mt-8">Payment Method</p>
      <div className="grid grid-cols-3 gap-2.5">
        {(['card', 'apple', 'google'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-sm border py-3 font-mono text-[11px] uppercase tracking-widest2 transition-colors duration-200 ${
              method === m ? 'border-apex bg-apex/5 text-white' : 'border-white/15 text-smoke/50'
            }`}
          >
            {m === 'card' ? 'Card' : m === 'apple' ? 'Apple Pay' : 'Google Pay'}
          </button>
        ))}
      </div>

      {method === 'card' && (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="input-field sm:col-span-2" placeholder="Card number" inputMode="numeric" />
          <input className="input-field" placeholder="MM / YY" />
          <input className="input-field" placeholder="CVC" inputMode="numeric" />
        </div>
      )}
      {method !== 'card' && (
        <div className="mt-5 rounded-sm border border-white/12 bg-white/[0.02] px-4 py-6 text-center text-sm text-smoke/50">
          {method === 'apple' ? 'Apple Pay' : 'Google Pay'} sheet opens on checkout.
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest2 text-smoke/40">
        <span>🔒 Stripe Secured</span>
        <span>PCI-DSS Compliant</span>
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button onClick={onPay} disabled={processing} className="btn-apex flex-1">
          {processing ? 'Processing…' : `Pay ${formatCurrency(amountDue)}`}
        </button>
      </div>

      <p className="mt-4 text-center text-[11px] text-smoke/30">
        Payment integration shown is a frontend placeholder — wire to the Stripe API to process
        real charges.
      </p>
    </div>
  );
}

'use client';

import { EstimateResult } from '@/lib/types';
import { formatCurrency } from '@/lib/pricing';

interface Props {
  estimate: EstimateResult;
  onNext: () => void;
  onBack: () => void;
}

export default function StepEstimate({ estimate, onNext, onBack }: Props) {
  return (
    <div>
      <h3 className="font-display text-2xl font-bold">Your estimate</h3>
      <p className="mt-2 text-sm text-smoke/50">Final pricing is confirmed after in-person inspection.</p>

      <div className="glass-panel mt-8 rounded-md p-7 shadow-card">
        <div className="flex flex-col gap-4 font-mono">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-widest2 text-smoke/50">
              Estimated Price
            </span>
            <span className="text-3xl font-semibold text-white">
              {formatCurrency(estimate.estimatedPrice)}
            </span>
          </div>
          <div className="hairline" />
          <Row label="Estimated Time" value={`${estimate.estimatedHours} hrs`} />
          <Row label="Deposit Required" value={formatCurrency(estimate.depositRequired)} />
          <Row label="Est. Completion" value={estimate.estimatedCompletion} />
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button onClick={onNext} className="btn-apex flex-1">
          Choose a Date
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] uppercase tracking-widest2 text-smoke/50">{label}</span>
      <span className="text-sm text-white/90">{value}</span>
    </div>
  );
}

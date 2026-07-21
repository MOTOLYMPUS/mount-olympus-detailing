'use client';

import { services } from '@/data/services';
import { ServiceId } from '@/lib/types';
import { formatCurrency } from '@/lib/pricing';

interface Props {
  selected: ServiceId[];
  onToggle: (id: ServiceId) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepService({ selected, onToggle, onNext, onBack }: Props) {
  return (
    <div>
      <h3 className="font-display text-2xl font-bold">Choose your services</h3>
      <p className="mt-2 text-sm text-smoke/50">Select one or more — your estimate updates instantly.</p>

      <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {services.map((svc) => {
          const active = selected.includes(svc.id);
          return (
            <button
              key={svc.id}
              onClick={() => onToggle(svc.id)}
              className={`flex items-center justify-between gap-3 rounded-sm border px-4 py-3.5 text-left transition-all duration-200 ${
                active ? 'border-apex/60 bg-apex/5' : 'border-white/12 hover:border-white/30'
              }`}
            >
              <div>
                <p className="text-sm text-white/90">{svc.name}</p>
                <p className="font-mono text-[11px] text-smoke/40">
                  From {formatCurrency(svc.startingPrice)}
                </p>
              </div>
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${
                  active ? 'border-apex bg-apex' : 'border-white/25'
                }`}
              >
                {active && (
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3.2 5.8L8 1" stroke="white" strokeWidth="1.4" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button disabled={selected.length === 0} onClick={onNext} className="btn-apex flex-1">
          Continue
        </button>
      </div>
    </div>
  );
}

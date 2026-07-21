'use client';

import { Package } from '@/lib/types';
import { priceForTier, addOnPriceForTier, formatCurrency } from '@/lib/pricing';

interface Props {
  packages: Package[];
  tier: string;
  selected: string[];
  addOns: string[];
  onTogglePackage: (id: string) => void;
  onToggleAddOn: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepService({
  packages,
  tier,
  selected,
  addOns,
  onTogglePackage,
  onToggleAddOn,
  onNext,
  onBack,
}: Props) {
  const availableAddOns = packages.filter((p) => selected.includes(p.id)).flatMap((p) => p.addOns ?? []);

  return (
    <div>
      <h3 className="font-display text-2xl font-bold">Choose your services</h3>
      <p className="mt-2 text-sm text-smoke/50">Select one or more — your estimate updates instantly.</p>

      <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {packages.map((pkg) => {
          const active = selected.includes(pkg.id);
          return (
            <button
              key={pkg.id}
              onClick={() => onTogglePackage(pkg.id)}
              className={`flex items-center justify-between gap-3 rounded-sm border px-4 py-3.5 text-left transition-all duration-200 ${
                active ? 'border-apex/60 bg-apex/5' : 'border-white/12 hover:border-white/30'
              }`}
            >
              <div>
                <p className="text-sm text-white/90">{pkg.name}</p>
                <p className="font-mono text-[11px] text-smoke/40">
                  {formatCurrency(priceForTier(pkg, tier))}
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

      {availableAddOns.length > 0 && (
        <>
          <p className="eyebrow mb-3 mt-8">Add-ons</p>
          <div className="flex flex-wrap gap-2.5">
            {availableAddOns.map((addOn) => {
              const active = addOns.includes(addOn.id);
              return (
                <button
                  key={addOn.id}
                  onClick={() => onToggleAddOn(addOn.id)}
                  className={`rounded-sm border px-4 py-2 font-mono text-[11px] uppercase tracking-widest2 transition-colors duration-200 ${
                    active ? 'border-apex bg-apex/10 text-white' : 'border-white/15 text-smoke/50'
                  }`}
                >
                  {addOn.name} · {formatCurrency(addOnPriceForTier(addOn.pricing, tier))}
                </button>
              );
            })}
          </div>
        </>
      )}

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
'use client';

import { AutoCategory, Industry, VehicleInfo } from '@/lib/types';
import { getTiers } from '@/data/industries';
import { getMakes } from '@/data/vehicleMakes';

interface Props {
  industry: Industry;
  vehicle: VehicleInfo;
  onChange: (v: VehicleInfo) => void;
  onNext: () => void;
}

export default function StepVehicle({ industry, vehicle, onChange, onNext }: Props) {
  const tiers = getTiers(industry, vehicle.category);
  const makes = getMakes(industry, vehicle.category);
  const canContinue = vehicle.make && vehicle.model && vehicle.year;

  return (
    <div>
      <h3 className="font-display text-2xl font-bold">
        Tell us about your {industry === 'auto' ? 'vehicle' : industry === 'marine' ? 'boat' : 'aircraft'}
      </h3>
      <p className="mt-2 text-sm text-smoke/50">This helps us prep the right products and bay.</p>

      {industry === 'auto' && (
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          {(['car', 'motorcycle'] as AutoCategory[]).map((c) => (
            <button
              key={c}
              onClick={() => onChange({ ...vehicle, category: c, make: '', tier: getTiers('auto', c)?.[0]?.tier ?? 'flat' })}
              className={`rounded-sm border px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest2 transition-colors duration-200 ${
                vehicle.category === c ? 'border-apex bg-apex/10 text-white' : 'border-white/15 text-smoke/50'
              }`}
            >
              {c === 'car' ? 'Car / Truck / SUV' : 'Motorcycle'}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <select
          className="input-field appearance-none"
          value={vehicle.make}
          onChange={(e) => onChange({ ...vehicle, make: e.target.value })}
        >
          <option value="" disabled>
            Make
          </option>
          {makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="input-field"
          placeholder="Model"
          value={vehicle.model}
          onChange={(e) => onChange({ ...vehicle, model: e.target.value })}
        />
        <input
          className="input-field"
          placeholder="Year"
          inputMode="numeric"
          maxLength={4}
          value={vehicle.year}
          onChange={(e) => onChange({ ...vehicle, year: e.target.value.replace(/\D/g, '') })}
        />
        {tiers && (
          <select
            className="input-field appearance-none"
            value={vehicle.tier}
            onChange={(e) => onChange({ ...vehicle, tier: e.target.value })}
          >
            {tiers.map((t) => (
              <option key={t.tier} value={t.tier}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <button disabled={!canContinue} onClick={onNext} className="btn-apex mt-8 w-full sm:w-auto">
        Continue
      </button>
    </div>
  );
}
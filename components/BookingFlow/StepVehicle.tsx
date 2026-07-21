'use client';

import { VehicleInfo, VehicleSize } from '@/lib/types';
import { SIZE_LABEL } from '@/lib/pricing';

const SIZES: VehicleSize[] = ['sedan', 'coupe', 'suv', 'truck', 'exotic'];

interface Props {
  vehicle: VehicleInfo;
  onChange: (v: VehicleInfo) => void;
  onNext: () => void;
}

export default function StepVehicle({ vehicle, onChange, onNext }: Props) {
  const canContinue = vehicle.make && vehicle.model && vehicle.year;

  return (
    <div>
      <h3 className="font-display text-2xl font-bold">Tell us about your vehicle</h3>
      <p className="mt-2 text-sm text-smoke/50">This helps us prep the right products and bay.</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          className="input-field"
          placeholder="Make (e.g. Porsche)"
          value={vehicle.make}
          onChange={(e) => onChange({ ...vehicle, make: e.target.value })}
        />
        <input
          className="input-field"
          placeholder="Model (e.g. 911 GT3)"
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
        <select
          className="input-field appearance-none"
          value={vehicle.size}
          onChange={(e) => onChange({ ...vehicle, size: e.target.value as VehicleSize })}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {SIZE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <button disabled={!canContinue} onClick={onNext} className="btn-apex mt-8 w-full sm:w-auto">
        Continue
      </button>
    </div>
  );
}

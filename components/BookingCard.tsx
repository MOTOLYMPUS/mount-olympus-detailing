'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AutoCategory, Industry } from '@/lib/types';
import { getMakes } from '@/data/vehicleMakes';
import { getPackages } from '@/data/industries';

interface Props {
  industry: Industry;
  onOpenBooking: (prefill: { make: string; model: string; year: string; packageId: string }) => void;
}

export default function BookingCard({ industry, onOpenBooking }: Props) {
  const [category, setCategory] = useState<AutoCategory>('car');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [packageId, setPackageId] = useState('');

  const effectiveCategory = industry === 'auto' ? category : industry;
  const makes = useMemo(() => getMakes(industry, effectiveCategory), [industry, effectiveCategory]);
  const packages = useMemo(() => getPackages(industry, effectiveCategory), [industry, effectiveCategory]);

  const canSubmit = make && model && year && packageId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel w-full max-w-[420px] rounded-md p-7 shadow-glass"
    >
      <p className="eyebrow mb-1">Instant Estimate</p>
      <h3 className="font-display text-xl font-bold tracking-tight text-white">
        Start Your Booking
      </h3>

      <div className="mt-6 flex flex-col gap-3.5">
        {industry === 'auto' && (
          <div className="grid grid-cols-2 gap-2.5">
            {(['car', 'motorcycle'] as AutoCategory[]).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCategory(c);
                  setMake('');
                  setPackageId('');
                }}
                className={`rounded-sm border px-3 py-2 font-mono text-[11px] uppercase tracking-widest2 transition-colors duration-200 ${
                  category === c ? 'border-apex bg-apex/10 text-white' : 'border-white/15 text-smoke/50'
                }`}
              >
                {c === 'car' ? 'Car / Truck / SUV' : 'Motorcycle'}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <select
            aria-label="Make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className="input-field appearance-none"
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
            aria-label="Model"
            placeholder="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="input-field"
          />
        </div>

        <input
          aria-label="Year"
          placeholder="Year"
          inputMode="numeric"
          maxLength={4}
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
          className="input-field"
        />

        <select
          aria-label="Service needed"
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          className="input-field appearance-none"
        >
          <option value="" disabled>
            Service Needed
          </option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="hairline my-1" />

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <button
            disabled={!canSubmit}
            onClick={() => onOpenBooking({ make, model, year, packageId })}
            className="btn-ghost flex-1"
          >
            Get Estimate
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => onOpenBooking({ make, model, year, packageId })}
            className="btn-apex flex-1"
          >
            Book Appointment
          </button>
        </div>
      </div>
    </motion.div>
  );
}
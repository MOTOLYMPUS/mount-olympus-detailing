'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { VehicleSize } from '@/lib/types';
import { services } from '@/data/services';

const MAKES = [
  'Ferrari',
  'Porsche',
  'Lamborghini',
  'McLaren',
  'Audi',
  'BMW',
  'Mercedes-Benz',
  'Chevrolet',
  'Other',
];

interface Props {
  onOpenBooking: (prefill: { make: string; model: string; year: string; serviceId: string }) => void;
}

export default function BookingCard({ onOpenBooking }: Props) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [serviceId, setServiceId] = useState('');

  const canSubmit = make && model && year && serviceId;

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
        <div className="grid grid-cols-2 gap-3">
          <select
            aria-label="Vehicle make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className="input-field appearance-none"
          >
            <option value="" disabled>
              Make
            </option>
            {MAKES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            aria-label="Vehicle model"
            placeholder="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="input-field"
          />
        </div>

        <input
          aria-label="Vehicle year"
          placeholder="Year"
          inputMode="numeric"
          maxLength={4}
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
          className="input-field"
        />

        <select
          aria-label="Service needed"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="input-field appearance-none"
        >
          <option value="" disabled>
            Service Needed
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="hairline my-1" />

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <button
            disabled={!canSubmit}
            onClick={() => onOpenBooking({ make, model, year, serviceId })}
            className="btn-ghost flex-1"
          >
            Get Estimate
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => onOpenBooking({ make, model, year, serviceId })}
            className="btn-apex flex-1"
          >
            Book Appointment
          </button>
        </div>
      </div>
    </motion.div>
  );
}

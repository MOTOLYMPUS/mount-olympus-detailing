'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServiceId, VehicleSize } from '@/lib/types';
import { services } from '@/data/services';
import { calculateEstimate, formatCurrency, SIZE_LABEL } from '@/lib/pricing';

const SIZES: VehicleSize[] = ['sedan', 'coupe', 'suv', 'truck', 'exotic'];

export default function EstimateCalculator({
  onBook,
}: {
  onBook: (services: ServiceId[], size: VehicleSize) => void;
}) {
  const [size, setSize] = useState<VehicleSize>('coupe');
  const [selected, setSelected] = useState<ServiceId[]>(['ceramic-coating']);

  const estimate = useMemo(() => calculateEstimate(size, selected), [size, selected]);

  const toggle = (id: ServiceId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  return (
    <section id="pricing" className="border-t border-white/10 bg-charcoal/40 py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-14 max-w-xl">
          <p className="eyebrow mb-4">Instant Estimate</p>
          <h2 className="font-display text-4xl font-bold tracking-tightest sm:text-5xl">
            Know the number before you book.
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
          {/* Selector panel */}
          <div>
            <p className="eyebrow mb-4">01 — Vehicle Size</p>
            <div className="flex flex-wrap gap-2.5">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`rounded-sm border px-5 py-2.5 font-mono text-[12px] uppercase tracking-widest2 transition-all duration-200 ${
                    size === s
                      ? 'border-apex bg-apex/10 text-white'
                      : 'border-white/15 text-smoke/60 hover:border-white/35'
                  }`}
                >
                  {SIZE_LABEL[s]}
                </button>
              ))}
            </div>

            <p className="eyebrow mb-4 mt-10">02 — Choose Services</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {services.map((svc) => {
                const active = selected.includes(svc.id);
                return (
                  <button
                    key={svc.id}
                    onClick={() => toggle(svc.id)}
                    className={`flex items-center justify-between gap-3 rounded-sm border px-4 py-3.5 text-left transition-all duration-200 ${
                      active
                        ? 'border-apex/60 bg-apex/5'
                        : 'border-white/12 hover:border-white/30'
                    }`}
                  >
                    <span className="text-sm text-white/90">{svc.name}</span>
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
          </div>

          {/* Telemetry readout */}
          <div className="glass-panel h-fit rounded-md p-8 shadow-card">
            <p className="eyebrow mb-6">Estimate Readout</p>

            <AnimatePresence mode="wait">
              {estimate ? (
                <motion.div
                  key={`${size}-${selected.join(',')}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-5 font-mono"
                >
                  <Readout label="Estimated Price" value={formatCurrency(estimate.estimatedPrice)} big />
                  <div className="hairline" />
                  <Readout label="Estimated Time" value={`${estimate.estimatedHours} hrs`} />
                  <Readout label="Deposit Required" value={formatCurrency(estimate.depositRequired)} />
                  <Readout label="Est. Completion" value={estimate.estimatedCompletion} />

                  <button
                    onClick={() => onBook(selected, size)}
                    className="btn-apex mt-4 w-full"
                  >
                    Book Appointment
                  </button>
                </motion.div>
              ) : (
                <p className="py-8 text-center text-sm text-smoke/50">
                  Select at least one service to generate an estimate.
                </p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function Readout({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] uppercase tracking-widest2 text-smoke/50">{label}</span>
      <span className={big ? 'text-2xl font-semibold text-white' : 'text-sm text-white/90'}>
        {value}
      </span>
    </div>
  );
}

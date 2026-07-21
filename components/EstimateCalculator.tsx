'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useIndustry } from './IndustryProvider';
import { ChoiceCard } from './Field';
import {
  availableAddOns,
  availableServices,
  calculateEstimate,
  formatHours,
  formatPrice,
} from '@/lib/pricing';
import { SizeClass } from '@/lib/types';
import { usePrefersReducedMotion } from '@/lib/useDialog';

interface Props {
  /**
   * Carries the FULL selection into the wizard. The previous build passed only
   * `services[0]` and dropped the vehicle size entirely, so the price the
   * customer agreed to was not the price they saw next.
   */
  onRequest: (payload: {
    sizeClass: SizeClass;
    serviceIds: string[];
    addOnIds: string[];
  }) => void;
}

export default function EstimateCalculator({ onRequest }: Props) {
  const { industry, config } = useIndustry();
  const reduced = usePrefersReducedMotion();

  const [size, setSize] = useState<SizeClass>(config.sizes[0].id);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);

  // An industry switch invalidates the size class and every service id.
  useEffect(() => {
    setSize(config.sizes[0].id);
    setServiceIds([]);
    setAddOnIds([]);
  }, [industry, config.sizes]);

  const services = useMemo(() => availableServices(industry, size), [industry, size]);
  const addOns = useMemo(() => availableAddOns(serviceIds, size), [serviceIds, size]);

  const estimate = useMemo(
    () => calculateEstimate({ industry, size, serviceIds, addOnIds }),
    [industry, size, serviceIds, addOnIds]
  );

  const toggleService = (id: string) => {
    const next = serviceIds.includes(id)
      ? serviceIds.filter((s) => s !== id)
      : [...serviceIds, id];
    setServiceIds(next);
    const ok = new Set(availableAddOns(next, size).map((a) => a.id));
    setAddOnIds((prev) => prev.filter((a) => ok.has(a)));
  };

  return (
    <section id="pricing" className="border-t border-white/10 bg-charcoal/40 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-10 max-w-xl sm:mb-14">
          <p className="eyebrow mb-4">Instant Estimate · {config.label}</p>
          <h2 className="font-display text-3xl font-bold tracking-tightest sm:text-5xl">
            Know the number before you commit.
          </h2>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:gap-10">
          <div>
            <p className="eyebrow mb-4">01 — {config.sizeLabel}</p>
            <div role="radiogroup" aria-label={config.sizeLabel} className="flex flex-wrap gap-2.5">
              {config.sizes.map((s) => {
                const active = size === s.id;
                return (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setSize(s.id);
                      setServiceIds([]);
                      setAddOnIds([]);
                    }}
                    className={`rounded-sm border px-4 py-2.5 font-mono text-[12px] uppercase tracking-widest2 transition-all duration-200 ${
                      active
                        ? 'border-apex bg-apex/10 text-white'
                        : 'border-white/20 text-muted hover:border-white/45 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            <p className="eyebrow mb-4 mt-9">02 — Services</p>
            <div role="group" aria-label="Services" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {services.map((svc) => {
                const price = svc.prices[size];
                return (
                  <ChoiceCard
                    key={svc.id}
                    selected={serviceIds.includes(svc.id)}
                    onToggle={() => toggleService(svc.id)}
                    title={svc.name}
                    meta={price ? formatPrice(price.price, price.priceMax) : undefined}
                  />
                );
              })}
            </div>

            {addOns.length > 0 && (
              <>
                <p className="eyebrow mb-4 mt-9">03 — Add-ons</p>
                <div role="group" aria-label="Add-ons" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {addOns.map((a) => {
                    const price = a.prices[size];
                    return (
                      <ChoiceCard
                        key={a.id}
                        selected={addOnIds.includes(a.id)}
                        onToggle={() =>
                          setAddOnIds((prev) =>
                            prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]
                          )
                        }
                        title={a.name}
                        meta={price ? formatPrice(price.price, price.priceMax) : undefined}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Readout */}
          <div className="glass-panel h-fit rounded-md p-6 shadow-card sm:p-8 lg:sticky lg:top-24">
            <p className="eyebrow mb-5">Estimate Readout</p>

            {estimate ? (
              <motion.div
                key={`${size}-${serviceIds.join(',')}-${addOnIds.join(',')}`}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : 0.22 }}
                className="flex flex-col gap-4 font-mono"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-widest2 text-subtle">
                    Estimated Total
                  </span>
                  <span className="text-2xl font-semibold text-white">
                    {formatPrice(estimate.total, estimate.totalMax)}
                  </span>
                </div>

                <div className="hairline" />

                <Readout
                  label="Services"
                  value={formatPrice(estimate.basePrice, estimate.basePriceMax)}
                />
                {estimate.addOnPrice > 0 && (
                  <Readout
                    label="Add-ons"
                    value={formatPrice(estimate.addOnPrice, estimate.addOnPriceMax)}
                  />
                )}
                <Readout label="Estimated Time" value={formatHours(estimate.estimatedHours)} />

                {estimate.isPlaceholderPricing && (
                  <p className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-body text-[12px] leading-relaxed text-amber-200">
                    Indicative only — {config.label.toLowerCase()} rates are being finalised and
                    will be confirmed before scheduling.
                  </p>
                )}

                <button
                  onClick={() => onRequest({ sizeClass: size, serviceIds, addOnIds })}
                  className="btn-apex mt-3 w-full"
                >
                  Request This Estimate
                </button>
              </motion.div>
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                Select at least one service to generate an estimate.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-widest2 text-subtle">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

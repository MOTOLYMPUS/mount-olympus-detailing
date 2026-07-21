'use client';

import { useMemo } from 'react';
import { useIndustry } from '../IndustryProvider';
import { ChoiceCard } from '../Field';
import { availableAddOns, availableServices, formatPrice } from '@/lib/pricing';
import { FormState } from './EstimateModal';

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function StepServices({ form, set, onBack, onNext }: Props) {
  const { industry } = useIndustry();
  const size = form.sizeClass || null;

  const services = useMemo(() => availableServices(industry, size), [industry, size]);
  const addOns = useMemo(() => availableAddOns(form.serviceIds, size), [form.serviceIds, size]);

  const toggleService = (id: string) => {
    const next = form.serviceIds.includes(id)
      ? form.serviceIds.filter((s) => s !== id)
      : [...form.serviceIds, id];
    set('serviceIds', next);

    // Drop any add-on that is no longer attachable to what's selected.
    const stillAttachable = new Set(availableAddOns(next, size).map((a) => a.id));
    set(
      'addOnIds',
      form.addOnIds.filter((a) => stillAttachable.has(a))
    );
  };

  const toggleAddOn = (id: string) =>
    set(
      'addOnIds',
      form.addOnIds.includes(id)
        ? form.addOnIds.filter((a) => a !== id)
        : [...form.addOnIds, id]
    );

  return (
    <div>
      <h2 id="estimate-dialog-title" className="font-display text-2xl font-bold">
        Choose your services
      </h2>
      <p className="mt-2 text-sm text-muted">
        Prices shown are for the size you selected. Your estimate updates instantly.
      </p>

      <div role="group" aria-label="Services" className="mt-7 flex flex-col gap-2.5">
        {services.map((svc) => {
          const price = size ? svc.prices[size] : undefined;
          return (
            <ChoiceCard
              key={svc.id}
              selected={form.serviceIds.includes(svc.id)}
              onToggle={() => toggleService(svc.id)}
              title={svc.name}
              subtitle={svc.shortDescription}
              meta={
                price
                  ? `${formatPrice(price.price, price.priceMax)} · approx. ${svc.estimatedHours} hrs`
                  : undefined
              }
            />
          );
        })}
      </div>

      {addOns.length > 0 && (
        <>
          <p className="eyebrow mb-3 mt-8">Add-ons</p>
          <div role="group" aria-label="Add-ons" className="flex flex-col gap-2.5">
            {addOns.map((addOn) => {
              const price = size ? addOn.prices[size] : undefined;
              return (
                <ChoiceCard
                  key={addOn.id}
                  selected={form.addOnIds.includes(addOn.id)}
                  onToggle={() => toggleAddOn(addOn.id)}
                  title={addOn.name}
                  subtitle={addOn.description}
                  meta={price ? formatPrice(price.price, price.priceMax) : undefined}
                />
              );
            })}
          </div>
        </>
      )}

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button
          disabled={form.serviceIds.length === 0}
          onClick={onNext}
          className="btn-apex flex-1"
        >
          See My Estimate
        </button>
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { useIndustry } from '../IndustryProvider';
import { InputField, SelectField } from '../Field';
import { getMakes, getModels } from '@/data/vehicles';
import { SizeClass } from '@/lib/types';
import { FormState } from './EstimateModal';

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  errors: Record<string, string>;
  onNext: () => void;
}

const OTHER = '__other__';

export default function StepVehicle({ form, set, errors, onNext }: Props) {
  const { config } = useIndustry();

  const typeDef = config.vehicleTypes.find((t) => t.id === form.vehicleType);

  const makes = useMemo(() => (typeDef ? getMakes(typeDef.catalog) : []), [typeDef]);
  const models = useMemo(
    () => (typeDef && form.make && form.make !== OTHER ? getModels(typeDef.catalog, form.make) : []),
    [typeDef, form.make]
  );

  // Sizes available for the chosen category only — this is what keeps a jet-ski
  // length off a yacht, and a 3-row SUV body style off a motorcycle.
  const sizes = useMemo(() => {
    if (!typeDef) return [];
    return config.sizes.filter((s) => typeDef.sizes.includes(s.id));
  }, [typeDef, config.sizes]);

  const canContinue =
    !!form.vehicleType && !!form.make && !!form.model && form.year.length === 4 && !!form.sizeClass;

  const currentYear = new Date().getFullYear();

  return (
    <div>
      <h2 id="estimate-dialog-title" className="font-display text-2xl font-bold">
        Tell us about your {config.noun}
      </h2>
      <p className="mt-2 text-sm text-muted">
        This sets the products, the bay, and the price band we quote from.
      </p>

      <div className="mt-7 flex flex-col gap-5">
        <SelectField
          label="Category"
          required
          value={form.vehicleType}
          placeholder={`Choose a category…`}
          error={errors.vehicleType}
          onChange={(v) => {
            set('vehicleType', v);
            // Category drives the catalog and the size list, so anything
            // downstream of it is now stale.
            set('make', '');
            set('model', '');
            set('sizeClass', '');
            set('serviceIds', []);
            set('addOnIds', []);
          }}
          options={config.vehicleTypes.map((t) => ({ value: t.id, label: t.label }))}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SelectField
            label={config.makeLabel}
            required
            disabled={!typeDef}
            value={form.make}
            placeholder={typeDef ? `Choose a ${config.makeLabel.toLowerCase()}…` : 'Choose a category first'}
            error={errors.make}
            onChange={(v) => {
              set('make', v);
              set('model', '');
            }}
            options={[
              ...makes.map((m) => ({ value: m.name, label: m.name })),
              { value: OTHER, label: 'Other / not listed' },
            ]}
          />

          {/* A known make gets a model dropdown; "Other" falls back to free
              text so nobody is ever blocked by a gap in the catalog. */}
          {form.make && form.make !== OTHER && models.length > 0 ? (
            <SelectField
              label={config.modelLabel}
              required
              value={form.model}
              placeholder={`Choose a ${config.modelLabel.toLowerCase()}…`}
              error={errors.model}
              onChange={(v) => set('model', v)}
              options={[
                ...models.map((m) => ({ value: m, label: m })),
                { value: 'Other', label: 'Other / not listed' },
              ]}
            />
          ) : (
            <InputField
              label={config.modelLabel}
              required
              disabled={!form.make}
              value={form.model}
              placeholder={form.make ? 'Type the model' : 'Choose a make first'}
              error={errors.model}
              onChange={(v) => set('model', v)}
              maxLength={80}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <InputField
            label={config.yearLabel}
            required
            value={form.year}
            placeholder={String(currentYear)}
            inputMode="numeric"
            maxLength={4}
            error={errors.year}
            onChange={(v) => set('year', v.replace(/\D/g, ''))}
          />

          <SelectField
            label={config.sizeLabel}
            required
            disabled={!typeDef}
            value={form.sizeClass}
            placeholder={typeDef ? `Choose a ${config.sizeLabel.toLowerCase()}…` : 'Choose a category first'}
            error={errors.sizeClass}
            onChange={(v) => {
              set('sizeClass', v as SizeClass);
              // Services are priced per size class; a size change can make a
              // previously chosen service unavailable.
              set('serviceIds', []);
              set('addOnIds', []);
            }}
            options={sizes.map((s) => ({
              value: s.id,
              label: s.hint ? `${s.label} — ${s.hint}` : s.label,
            }))}
          />
        </div>
      </div>

      <div className="mt-8">
        <button disabled={!canContinue} onClick={onNext} className="btn-apex w-full">
          Continue
        </button>
      </div>
    </div>
  );
}

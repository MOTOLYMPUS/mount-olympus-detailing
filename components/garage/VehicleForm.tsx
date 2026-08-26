'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Add / edit a vehicle.
//
// The cascade is industry → type → size → make → model, and each step narrows
// the next. That structure is not invented here — it is exactly what
// lib/industries.ts already describes, and the same one the public estimate
// wizard uses. Reusing it means a boat, a jet ski and a helicopter all work
// with no special cases in this component.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { InputField, SelectField, TextAreaField, ChoiceCard } from '@/components/Field';
import { Alert, buttonClass } from '@/components/ui';
import { industryList, industries } from '@/lib/industries';
import { getMakes, getModels } from '@/data/vehicles';
import { Industry, SizeClass } from '@/lib/types';
import { Vehicle } from '@/lib/models';

export default function VehicleForm({ vehicle }: { vehicle?: Vehicle }) {
  const router = useRouter();

  const [industry, setIndustry] = useState<Industry>(vehicle?.industry ?? 'automotive');
  const [vehicleType, setVehicleType] = useState(vehicle?.vehicleType ?? '');
  const [sizeClass, setSizeClass] = useState<string>(vehicle?.sizeClass ?? '');
  const [make, setMake] = useState(vehicle?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [year, setYear] = useState(vehicle?.year ?? '');
  const [trim, setTrim] = useState(vehicle?.trim ?? '');
  const [color, setColor] = useState(vehicle?.color ?? '');
  const [vin, setVin] = useState(vehicle?.vin ?? '');
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [notes, setNotes] = useState(vehicle?.notes ?? '');
  const [isDefault, setIsDefault] = useState(vehicle?.isDefault ?? false);

  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const config = industries[industry];
  const typeDef = config.vehicleTypes.find((t) => t.id === vehicleType);

  // Only the sizes this vehicle type actually offers. Without this narrowing a
  // customer could pair "Motorcycle" with "3-Row SUV" and the server would
  // reject it — better to make the invalid combination unreachable.
  const sizes = useMemo(
    () => config.sizes.filter((s) => !typeDef || typeDef.sizes.includes(s.id)),
    [config.sizes, typeDef]
  );

  const makes = typeDef ? getMakes(typeDef.catalog) : [];
  const models = typeDef && make ? getModels(typeDef.catalog, make) : [];

  function changeIndustry(next: Industry) {
    // Every downstream choice belongs to the old industry's vocabulary, so
    // clear them rather than leaving a stale, invalid selection behind.
    setIndustry(next);
    setVehicleType('');
    setSizeClass('');
    setMake('');
    setModel('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setBanner('');
    setErrors({});

    const payload = {
      industry,
      vehicleType,
      sizeClass,
      make,
      model,
      year,
      trim,
      color,
      vin,
      plate,
      notes,
      isDefault,
    };

    try {
      const res = await fetch(vehicle ? `/api/vehicles/${vehicle.id}` : '/api/vehicles', {
        method: vehicle ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setErrors(data.errors ?? {});
        if (!Object.keys(data.errors ?? {}).length) {
          setBanner(data.error ?? 'We could not save that. Please try again.');
        }
        return;
      }

      router.push('/app/garage');
      router.refresh();
    } catch {
      setBanner('We could not reach the server. Your connection may be offline.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {banner && <Alert tone="danger">{banner}</Alert>}

      {/* ── Industry ─────────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="eyebrow mb-3">What is it?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {industryList.map((cfg) => (
            <ChoiceCard
              key={cfg.id}
              multi={false}
              selected={industry === cfg.id}
              onToggle={() => changeIndustry(cfg.id)}
              title={cfg.label}
              subtitle={cfg.tagline}
            />
          ))}
        </div>
      </fieldset>

      {/* ── Type ─────────────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="eyebrow mb-3">Type</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {config.vehicleTypes.map((t) => (
            <ChoiceCard
              key={t.id}
              multi={false}
              selected={vehicleType === t.id}
              onToggle={() => {
                setVehicleType(t.id);
                setSizeClass('');
                setMake('');
                setModel('');
              }}
              title={t.label}
            />
          ))}
        </div>
        {errors.vehicleType && (
          <p className="mt-2 text-[12px] text-flare" role="alert">
            {errors.vehicleType}
          </p>
        )}
      </fieldset>

      {/* ── Size ─────────────────────────────────────────────────────────── */}
      {vehicleType && (
        <fieldset>
          <legend className="eyebrow mb-3">{config.sizeLabel}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sizes.map((s) => (
              <ChoiceCard
                key={s.id}
                multi={false}
                selected={sizeClass === s.id}
                onToggle={() => setSizeClass(s.id)}
                title={s.label}
                subtitle={s.hint}
              />
            ))}
          </div>
          {errors.sizeClass && (
            <p className="mt-2 text-[12px] text-flare" role="alert">
              {errors.sizeClass}
            </p>
          )}
        </fieldset>
      )}

      {/* ── Details ──────────────────────────────────────────────────────── */}
      {vehicleType && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="eyebrow mb-3">Details</legend>

          {makes.length > 0 ? (
            <SelectField
              label={config.makeLabel}
              value={make}
              onChange={(v) => {
                setMake(v);
                setModel('');
              }}
              options={makes.map((m) => ({ value: m.name, label: m.name }))}
              required
              error={errors.make}
            />
          ) : (
            <InputField label={config.makeLabel} value={make} onChange={setMake} required error={errors.make} />
          )}

          {models.length > 0 ? (
            <SelectField
              label={config.modelLabel}
              value={model}
              onChange={setModel}
              options={models.map((m) => ({ value: m, label: m }))}
              required
              error={errors.model}
              // A catalogue is never complete; the free-text fallback below
              // means an unlisted model is not a dead end.
              hint="Not listed? Choose the closest and add the exact model in notes."
            />
          ) : (
            <InputField label={config.modelLabel} value={model} onChange={setModel} required error={errors.model} />
          )}

          <InputField
            label={config.yearLabel}
            value={year}
            onChange={setYear}
            inputMode="numeric"
            maxLength={4}
            error={errors.year}
          />
          <InputField label="Trim" value={trim} onChange={setTrim} maxLength={60} />
          <InputField label="Colour" value={color} onChange={setColor} maxLength={40} />
          <InputField
            label="Registration / tail number"
            value={plate}
            onChange={setPlate}
            maxLength={12}
          />

          <div className="sm:col-span-2">
            <InputField
              label="VIN / hull ID"
              value={vin}
              onChange={setVin}
              maxLength={17}
              error={errors.vin}
              hint="Optional. Helps us match the exact paint or gelcoat system."
            />
          </div>

          <div className="sm:col-span-2">
            <TextAreaField
              label="Notes"
              value={notes}
              onChange={setNotes}
              rows={3}
              maxLength={1000}
              hint="Anything we should know — soft paint, a repaired panel, pets in the car."
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-[13px] text-muted sm:col-span-2">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 accent-[#D4001A]"
            />
            Make this my default vehicle when booking
          </label>
        </fieldset>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !vehicleType || !sizeClass}
          className={buttonClass('primary')}
        >
          {pending ? 'Saving…' : vehicle ? 'Save changes' : 'Add vehicle'}
        </button>
        <button type="button" onClick={() => router.back()} className={buttonClass('ghost')}>
          Cancel
        </button>
      </div>
    </form>
  );
}

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
import { useEffect, useMemo, useRef, useState } from 'react';
import { InputField, SelectField, TextAreaField, ChoiceCard } from '@/components/Field';
import { Alert, buttonClass } from '@/components/ui';
import PhotoCropper from '@/components/garage/PhotoCropper';
import { VEHICLE_PHOTO_ASPECT } from '@/components/garage/VehiclePhotoUploader';
import { VEHICLE_PHOTO_ASPECT_CLASS } from '@/components/garage/VehiclePhoto';
import { industryList, industries } from '@/lib/industries';
import { getMakes, getModels } from '@/data/vehicles';
import { colorsForIndustry, OTHER_COLOR } from '@/data/colors';
import { Industry, SizeClass } from '@/lib/types';
import { Vehicle } from '@/lib/models';

// "License plate" is the ask for cars and bikes; the same field holds a hull
// registration for boats and a tail number for aircraft, so the label follows
// the industry rather than calling an N-number a license plate.
const PLATE_LABEL: Record<Industry, string> = {
  automotive: 'License plate',
  marine: 'Registration number',
  aviation: 'Tail number',
};

export default function VehicleForm({
  vehicle,
  forUserId,
  successHref = '/app/garage',
}: {
  vehicle?: Vehicle;
  /** STAFF MODE: add the vehicle to this customer's garage (managers+ only, enforced by the API). */
  forUserId?: string;
  /** Where to go after saving. */
  successHref?: string;
}) {
  const router = useRouter();

  const [industry, setIndustry] = useState<Industry>(vehicle?.industry ?? 'automotive');
  const [vehicleType, setVehicleType] = useState(vehicle?.vehicleType ?? '');
  const [sizeClass, setSizeClass] = useState<string>(vehicle?.sizeClass ?? '');
  const [make, setMake] = useState(vehicle?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [year, setYear] = useState(vehicle?.year ?? '');

  // Colour is a dropdown of colour families (data/colors.ts) with a free-text
  // "Other". A stored colour that is not in the list (typed before the dropdown
  // existed, or entered via "Other") is shown as Other + the stored text, so
  // editing never silently discards it.
  const initialColors = colorsForIndustry(vehicle?.industry ?? 'automotive');
  const storedColor = vehicle?.color ?? '';
  const storedIsListed = !storedColor || initialColors.includes(storedColor);
  const [color, setColor] = useState(storedIsListed ? storedColor : OTHER_COLOR);
  const [colorOther, setColorOther] = useState(storedIsListed ? '' : storedColor);

  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [notes, setNotes] = useState(vehicle?.notes ?? '');
  const [isDefault, setIsDefault] = useState(vehicle?.isDefault ?? false);

  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // STAFF MODE, new vehicle only: a photo taken on the driveway, framed with
  // the same cropper the customer's garage uses, uploaded once the vehicle
  // row exists (the upload needs an id to attach to). Editing keeps using the
  // garage's own uploader, which handles replace/remove.
  const allowPhoto = !!forUserId && !vehicle;
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  useEffect(() => {
    if (!photoBlob) {
      setPhotoPreview('');
      return;
    }
    const url = URL.createObjectURL(photoBlob);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoBlob]);

  async function attachPhoto(vehicleId: string) {
    if (!photoBlob) return;
    const form = new FormData();
    form.set('scope', 'vehicles');
    form.append('file', photoBlob, 'vehicle.jpg');
    const up = await fetch('/api/uploads', { method: 'POST', body: form });
    const upData = await up.json().catch(() => ({}));
    if (!up.ok || !upData.ok) throw new Error(upData.error ?? 'That upload failed.');
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setPhoto', photoUrl: upData.files[0].url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not save the photo.');
  }

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
  const colors = colorsForIndustry(industry);

  // Newest first: next model year down to 1900 (classics and warbirds). Bounds
  // mirror the server's year validation and the public estimate wizard.
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = currentYear + 1; y >= 1900; y--) out.push(String(y));
    return out;
  }, [currentYear]);

  function changeIndustry(next: Industry) {
    // Every downstream choice belongs to the old industry's vocabulary, so
    // clear them rather than leaving a stale, invalid selection behind. Colour
    // families differ per industry too (gelcoat vs paint vs livery).
    setIndustry(next);
    setVehicleType('');
    setSizeClass('');
    setMake('');
    setModel('');
    setColor('');
    setColorOther('');
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
      // Trim and VIN are no longer asked for on the form. They are still sent
      // through unchanged so editing an older vehicle that has them does not
      // wipe the stored values.
      trim: vehicle?.trim ?? '',
      vin: vehicle?.vin ?? '',
      color: color === OTHER_COLOR ? colorOther.trim() : color,
      plate,
      notes,
      isDefault,
      // Staff mode only; a customer's own session has the field ignored.
      ...(forUserId ? { userId: forUserId } : {}),
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

      // The vehicle exists from here on; a failed photo must not leave the
      // owner on a form whose submit would create a duplicate.
      if (allowPhoto && photoBlob && data.vehicle?.id) {
        try {
          await attachPhoto(data.vehicle.id);
        } catch (err) {
          window.alert(
            `Vehicle saved, but the photo did not upload (${err instanceof Error ? err.message : 'upload failed'}). You can add it from their garage.`
          );
        }
      }

      router.push(successHref);
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
                // A type with a single size (motorcycle, PWC, helicopter…)
                // gets it chosen here, so the size section below can be
                // skipped rather than asking a question with one answer.
                setSizeClass(t.sizes.length === 1 ? t.sizes[0] : '');
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
      {vehicleType && sizes.length > 1 && (
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

          {/* Field order is year → make → model → color → plate, the way people
              describe a vehicle out loud ("a 2022 Ducati Panigale, red"). */}
          <SelectField
            label={config.yearLabel}
            value={year}
            onChange={setYear}
            placeholder="Choose a year…"
            options={years.map((y) => ({ value: y, label: y }))}
            error={errors.year}
          />

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

          <SelectField
            label="Color"
            value={color}
            onChange={(v) => {
              setColor(v);
              if (v !== OTHER_COLOR) setColorOther('');
            }}
            placeholder="Choose a color…"
            options={colors.map((c) => ({ value: c, label: c }))}
          />

          {color === OTHER_COLOR && (
            <InputField
              label="Color name"
              value={colorOther}
              onChange={setColorOther}
              maxLength={40}
              placeholder="e.g. Rosso Corsa"
              hint="The factory name if you know it."
            />
          )}

          <InputField label={PLATE_LABEL[industry]} value={plate} onChange={setPlate} maxLength={12} />

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
            {forUserId ? 'Make this their default vehicle when booking' : 'Make this my default vehicle when booking'}
          </label>
        </fieldset>
      )}

      {/* ── Photo (staff, new vehicle) ───────────────────────────────────── */}
      {allowPhoto && vehicleType && (
        <fieldset>
          <legend className="eyebrow mb-3">Photo</legend>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            aria-label="Choose a photo of the vehicle"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) setPicked(file);
            }}
          />
          {photoPreview ? (
            <div className="overflow-hidden rounded-sm border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Vehicle photo preview" className={`${VEHICLE_PHOTO_ASPECT_CLASS} w-full object-cover`} />
              <div className="flex gap-2 border-t border-white/10 p-2">
                <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass('secondary', 'sm')}>
                  Change
                </button>
                <button type="button" onClick={() => setPhotoBlob(null)} className={buttonClass('ghost', 'sm')}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-white/20 bg-white/[0.02] text-muted transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="font-mono text-[11px] uppercase tracking-widest2">Take or choose a photo</span>
              <span className="text-[11px] text-subtle">Optional — shows on their bookings and garage.</span>
            </button>
          )}
          {picked && (
            <PhotoCropper
              file={picked}
              aspect={VEHICLE_PHOTO_ASPECT}
              onCancel={() => setPicked(null)}
              onDone={(blob) => {
                setPicked(null);
                setPhotoBlob(blob);
              }}
            />
          )}
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

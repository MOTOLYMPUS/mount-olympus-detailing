'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Marketing-expense extras: the drive to the event and photos of it.
//
// Controlled — the expense form (new) and the ledger's "Event" panel (edit)
// own the state and send it with the expense:
//   mileage    { from, to, roundTrip, businessVehicleId } or null
//   photoKeys  'events' upload keys, in order
// The server turns mileage into a trip on the mileage log (distance looked up
// from OpenStreetMap; flagged for manual entry if an address can't be found).
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import { buttonClass } from '@/components/ui';
import { InputField, SelectField } from '@/components/Field';
import { VehicleOption, vehicleForDate } from './TripEditor';

export interface EventExtrasValue {
  mileageOn: boolean;
  from: string;
  to: string;
  roundTrip: boolean;
  vehicleId: string;
  photoKeys: string[];
}

export function emptyEventExtras(baseAddress: string): EventExtrasValue {
  return { mileageOn: false, from: baseAddress, to: '', roundTrip: true, vehicleId: '', photoKeys: [] };
}

/** The request fields for these extras. */
export function eventExtrasBody(v: EventExtrasValue) {
  return {
    mileage: v.mileageOn
      ? { from: v.from, to: v.to, roundTrip: v.roundTrip, businessVehicleId: v.vehicleId || null }
      : null,
    photoKeys: v.photoKeys,
  };
}

export default function EventExtras({
  value,
  onChange,
  vehicles,
  date,
  errors = {},
  onBusy,
  onError,
}: {
  value: EventExtrasValue;
  onChange: (v: EventExtrasValue) => void;
  vehicles: VehicleOption[];
  /** The expense date — picks the default vehicle. */
  date: string;
  errors?: Record<string, string>;
  onBusy?: (busy: boolean) => void;
  onError?: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const set = (patch: Partial<EventExtrasValue>) => onChange({ ...value, ...patch });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 10);
    e.target.value = '';
    if (!files.length) return;
    setUploading(files.length);
    onBusy?.(true);
    try {
      const form = new FormData();
      form.set('scope', 'events');
      for (const f of files) form.append('file', f);
      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'That upload failed.');
      const keys = (data.files as { key: string }[]).map((f) => f.key);
      onChange({ ...value, photoKeys: [...value.photoKeys, ...keys].slice(0, 20) });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'That upload failed.');
    } finally {
      setUploading(0);
      onBusy?.(false);
    }
  }

  return (
    <div className="space-y-4 rounded-sm border border-white/10 p-3">
      {/* ── Mileage ── */}
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-white">
        <input
          type="checkbox"
          className="h-4 w-4 accent-apex"
          checked={value.mileageOn}
          onChange={(e) =>
            set({
              mileageOn: e.target.checked,
              vehicleId: value.vehicleId || vehicleForDate(vehicles, date),
            })
          }
        />
        Add mileage for this event
      </label>

      {value.mileageOn && (
        <div className="space-y-3 border-l-2 border-apex/40 pl-3">
          <InputField
            label="From"
            value={value.from}
            onChange={(v) => set({ from: v })}
            placeholder="Street, City, ST"
            error={errors['mileage.from']}
            hint="Defaults to your business address from the tax profile."
          />
          <InputField
            label="To (event location)"
            value={value.to}
            onChange={(v) => set({ to: v })}
            placeholder="Event address"
            required
            error={errors['mileage.to']}
          />
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-apex"
              checked={value.roundTrip}
              onChange={(e) => set({ roundTrip: e.target.checked })}
            />
            Round trip — drove back to the starting point
          </label>
          <SelectField
            label="Vehicle"
            value={value.vehicleId}
            onChange={(v) => set({ vehicleId: v })}
            placeholder={vehicles.length ? 'Choose a vehicle' : 'No vehicles yet — add one on the Mileage page'}
            options={vehicles.map((v) => ({ value: v.id, label: v.description }))}
            error={errors['mileage.businessVehicleId']}
          />
          <p className="text-[12px] leading-snug text-subtle">
            Saved to the mileage log with the driving distance from OpenStreetMap. If an address can&rsquo;t be
            found, the trip is saved without miles and flagged for you to fill in.
          </p>
        </div>
      )}

      {/* ── Photos ── */}
      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest2 text-subtle">Event photos</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={onPick}
          aria-label="Add event photos"
        />
        {value.photoKeys.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {value.photoKeys.map((key) => (
              <li key={key} className="relative">
                <a href={`/api/files/${key}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${key}`} alt="Event" className="h-16 w-16 rounded-sm border border-white/10 object-cover" />
                </a>
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-obsidian text-[12px] text-white ring-1 ring-white/30 hover:bg-apex"
                  onClick={() => set({ photoKeys: value.photoKeys.filter((k) => k !== key) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={uploading > 0 || value.photoKeys.length >= 20}
          onClick={() => fileRef.current?.click()}
          className={buttonClass('secondary', 'sm')}
        >
          {uploading ? `Uploading ${uploading}…` : '📷 Add photos'}
        </button>
        {errors.photoKeys && <p className="mt-1 text-[12px] text-flare">{errors.photoKeys}</p>}
      </div>
    </div>
  );
}

'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Marketing-expense extras: the drive to the event and photos of it.
//
// Controlled — the expense form (new) and the ledger's "Event" panel (edit)
// own the state and send it with the expense:
//   mileage    { from, to, roundTrip, businessVehicleId, miles } or null
//   photoKeys  'events' upload keys, in order
//
// MILES. As soon as From and To are filled in, the form asks
// /api/mileage/estimate (debounced) and shows the driving distance one way and
// round trip. The owner can type their own figure instead; left blank, the
// server looks the distance up again on save, and if an address can't be found
// the trip is saved without miles and flagged — never guessed.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui';
import { InputField, SelectField } from '@/components/Field';
import { VehicleOption, vehicleForDate } from './TripEditor';

export interface EventExtrasValue {
  mileageOn: boolean;
  from: string;
  to: string;
  roundTrip: boolean;
  vehicleId: string;
  /** Typed miles for the whole trip; '' = use the looked-up distance. */
  miles: string;
  photoKeys: string[];
}

export function emptyEventExtras(baseAddress: string): EventExtrasValue {
  return { mileageOn: false, from: baseAddress, to: '', roundTrip: true, vehicleId: '', miles: '', photoKeys: [] };
}

/** The request fields for these extras. */
export function eventExtrasBody(v: EventExtrasValue) {
  return {
    mileage: v.mileageOn
      ? {
          from: v.from,
          to: v.to,
          roundTrip: v.roundTrip,
          businessVehicleId: v.vehicleId || null,
          miles: v.miles.trim() || null,
        }
      : null,
    photoKeys: v.photoKeys,
  };
}

type Estimate =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; oneWayTenths: number; roundTripTenths: number; key: string }
  | { state: 'failed'; reason: string };

const mi = (tenths: number) => (tenths / 10).toFixed(1);

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
  const [estimate, setEstimate] = useState<Estimate>({ state: 'idle' });
  const set = (patch: Partial<EventExtrasValue>) => onChange({ ...value, ...patch });

  // Live distance preview: 900 ms after the addresses stop changing.
  const from = value.from.trim();
  const to = value.to.trim();
  const routeKey = `${from}|${to}`;
  useEffect(() => {
    if (!value.mileageOn || !from || to.length < 5) {
      setEstimate({ state: 'idle' });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setEstimate({ state: 'loading' });
      try {
        const res = await fetch('/api/mileage/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.estimate) {
          setEstimate({ state: 'done', key: routeKey, ...data.estimate });
        } else {
          setEstimate({ state: 'failed', reason: data.reason ?? data.error ?? 'Could not look up the distance.' });
        }
      } catch {
        if (!cancelled) setEstimate({ state: 'failed', reason: 'Could not reach the server to look up the distance.' });
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, value.mileageOn]);

  const tripTenths =
    estimate.state === 'done' ? (value.roundTrip ? estimate.roundTripTenths : estimate.oneWayTenths) : null;

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

          {/* Live distance */}
          <div className="rounded-sm bg-white/[0.03] px-3 py-2.5 text-[13px]" aria-live="polite">
            {estimate.state === 'idle' && (
              <span className="text-subtle">Enter both addresses and the driving miles appear here.</span>
            )}
            {estimate.state === 'loading' && <span className="text-muted">Calculating driving distance…</span>}
            {estimate.state === 'done' && (
              <span className="text-white">
                <span className={value.roundTrip ? 'text-muted' : 'font-semibold'}>{mi(estimate.oneWayTenths)} mi one way</span>
                {' · '}
                <span className={value.roundTrip ? 'font-semibold' : 'text-muted'}>
                  {mi(estimate.roundTripTenths)} mi round trip
                </span>
              </span>
            )}
            {estimate.state === 'failed' && (
              <span className="text-amber-300">
                {estimate.reason} You can still save; the trip will be flagged until miles are entered.
              </span>
            )}
          </div>

          <InputField
            label="Miles for this trip (optional)"
            value={value.miles}
            onChange={(v) => set({ miles: v.replace(/[^0-9.]/g, '') })}
            inputMode="decimal"
            placeholder={tripTenths !== null ? mi(tripTenths) : '0.0'}
            error={errors['mileage.miles']}
            hint={
              value.miles.trim()
                ? 'Your figure is saved as typed.'
                : 'Leave blank to use the calculated distance, or type your own (e.g. from the odometer).'
            }
          />

          {vehicles.length > 0 ? (
            <SelectField
              label="Vehicle"
              value={value.vehicleId}
              onChange={(v) => set({ vehicleId: v })}
              placeholder="Choose a vehicle"
              options={vehicles.map((v) => ({ value: v.id, label: v.description }))}
              error={errors['mileage.businessVehicleId']}
            />
          ) : (
            <p className="rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] leading-snug text-amber-100">
              No business vehicle yet. The trip still saves, flagged until you pick one.{' '}
              <Link href="/admin/mileage" className="underline">
                Add your vehicle on the Mileage page
              </Link>
              .
            </p>
          )}
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

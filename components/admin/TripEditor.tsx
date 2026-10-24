'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Log or edit one trip — supply runs, car shows, prospecting, a GPS-tracked
// drive, or a correction to a job trip the app logged.
//
// Miles come from ONE place, chosen by "How were the miles measured?":
//   route     the server looks up the driving distance for the addresses
//   odometer  end − start, with optional photos of each reading
//   manual    typed in
//   gps       measured by the tracker on this page (still editable)
// Miles are typed in miles and become integer tenths on the server.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Alert, buttonClass } from '@/components/ui';
import { InputField, SelectField, TextAreaField } from '@/components/Field';
import type { Trip, TripSource, TripStop } from '@/lib/models';

export interface VehicleOption {
  id: string;
  description: string;
  activeFrom: string | null;
  retiredOn: string | null;
  isDefault: boolean;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mirrors defaultVehicleFor() in lib/repo/mileage.ts. */
export function vehicleForDate(vehicles: VehicleOption[], date: string): string {
  const active = vehicles
    .filter((v) => (!v.activeFrom || v.activeFrom <= date) && (!v.retiredOn || v.retiredOn >= date))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.activeFrom ?? '').localeCompare(a.activeFrom ?? ''));
  return active[0]?.id ?? '';
}

const SOURCES: { value: TripSource; label: string }[] = [
  { value: 'route', label: 'Look up the driving distance' },
  { value: 'odometer', label: 'Odometer readings' },
  { value: 'manual', label: 'I’ll type the miles' },
  { value: 'gps', label: 'GPS tracked on this phone' },
];

export interface TripDraft {
  tripDate?: string;
  source?: TripSource;
  miles?: string;
  notes?: string;
}

export default function TripEditor({
  vehicles,
  baseAddress,
  trip,
  draft,
  onDone,
}: {
  vehicles: VehicleOption[];
  baseAddress: string;
  /** Editing an existing trip; omitted for a new one. */
  trip?: Trip;
  /** Prefill for a new trip (the GPS tracker hands its result over this way). */
  draft?: TripDraft;
  onDone: () => void;
}) {
  const router = useRouter();
  const startPhotoRef = useRef<HTMLInputElement>(null);
  const endPhotoRef = useRef<HTMLInputElement>(null);

  const initialDate = trip?.tripDate ?? draft?.tripDate ?? todayIso();
  const [tripDate, setTripDate] = useState(initialDate);
  const [vehicleId, setVehicleId] = useState(trip ? (trip.businessVehicleId ?? '') : vehicleForDate(vehicles, initialDate));
  const [startAddress, setStartAddress] = useState(trip?.startAddress ?? baseAddress);
  const [stops, setStops] = useState<TripStop[]>(trip?.stops.length ? trip.stops : [{ label: '', address: '' }]);
  const [returnToStart, setReturnToStart] = useState(trip ? trip.endAddress === trip.startAddress : true);
  const [endAddress, setEndAddress] = useState(trip?.endAddress ?? baseAddress);
  const [purpose, setPurpose] = useState(trip?.purpose ?? '');
  const [source, setSource] = useState<TripSource>(trip?.source ?? draft?.source ?? 'manual');
  const [miles, setMiles] = useState(
    trip?.milesTenths != null ? (trip.milesTenths / 10).toFixed(1) : (draft?.miles ?? '')
  );
  const [odoStart, setOdoStart] = useState(trip?.odometerStart != null ? String(trip.odometerStart) : '');
  const [odoEnd, setOdoEnd] = useState(trip?.odometerEnd != null ? String(trip.odometerEnd) : '');
  const [startKey, setStartKey] = useState(trip?.odometerStartKey ?? '');
  const [endKey, setEndKey] = useState(trip?.odometerEndKey ?? '');
  const [notes, setNotes] = useState(trip?.notes ?? draft?.notes ?? '');

  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function upload(file: File, set: (key: string) => void) {
    setUploading(true);
    setBanner('');
    try {
      const form = new FormData();
      form.set('scope', 'odometer');
      form.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Upload failed.');
      set(data.files[0].key);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setPending(true);
    setBanner('');
    setErrors({});
    try {
      const body = {
        tripDate,
        businessVehicleId: vehicleId || null,
        startAddress,
        stops: stops.filter((s) => s.label.trim() || s.address.trim()),
        endAddress: returnToStart ? startAddress : endAddress,
        purpose,
        source,
        miles: source === 'odometer' || source === 'route' ? null : miles,
        odometerStart: odoStart,
        odometerEnd: odoEnd,
        odometerStartKey: startKey || null,
        odometerEndKey: endKey || null,
        notes,
      };
      const res = await fetch(trip ? `/api/mileage/trips/${trip.id}` : '/api/mileage/trips', {
        method: trip ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setBanner(data.error ?? 'That did not save.');
        setErrors(data.errors ?? {});
        return;
      }
      // A new route trip has no miles until it is looked up.
      if (!trip && source === 'route' && data.trip?.id) {
        await fetch(`/api/mileage/trips/${data.trip.id}/recalculate`, { method: 'POST' }).catch(() => undefined);
      }
      router.refresh();
      onDone();
    } catch {
      setBanner('We could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  const photoButton = (
    label: string,
    key: string,
    set: (k: string) => void,
    ref: React.RefObject<HTMLInputElement | null>
  ) => (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f, set);
          e.target.value = '';
        }}
      />
      {key ? (
        <>
          <a href={`/api/files/${key}`} target="_blank" rel="noreferrer" className="text-[12px] text-sky-400 underline">
            View photo
          </a>
          <button type="button" className="text-[12px] text-subtle hover:text-white" onClick={() => set('')}>
            Remove
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={uploading}
          className={buttonClass('secondary', 'sm')}
          onClick={() => ref.current?.click()}
        >
          {uploading ? 'Uploading…' : `📷 ${label}`}
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4 rounded-sm border border-white/10 bg-white/[0.02] p-4">
      {banner && <Alert tone="danger">{banner}</Alert>}
      {trip?.appointmentIds.length ? (
        <p className="text-[12px] text-subtle">
          Logged automatically from {trip.appointmentIds.length > 1 ? 'these jobs' : 'this job'}. Edits are kept; a
          new job the same day is added as another stop.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Date"
          type="date"
          value={tripDate}
          max={todayIso()}
          required
          error={errors.tripDate}
          onChange={(v) => {
            setTripDate(v);
            if (!trip) setVehicleId(vehicleForDate(vehicles, v));
          }}
        />
        <SelectField
          label="Vehicle"
          value={vehicleId}
          onChange={setVehicleId}
          placeholder="Choose a vehicle"
          error={errors.businessVehicleId}
          options={vehicles.map((v) => ({ value: v.id, label: v.description }))}
        />
      </div>

      <InputField
        label="Business purpose"
        value={purpose}
        onChange={setPurpose}
        required
        error={errors.purpose}
        placeholder="Supply run — Chemical Guys; car show; prospecting"
      />

      <InputField label="Starting point" value={startAddress} onChange={setStartAddress} placeholder="Street, City, ST" />

      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">Stops, in order</p>
        {stops.map((s, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input
              className="input-field"
              placeholder="Who / where"
              aria-label={`Stop ${i + 1} name`}
              value={s.label}
              onChange={(e) => setStops((rows) => rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
            />
            <input
              className="input-field"
              placeholder="Address"
              aria-label={`Stop ${i + 1} address`}
              value={s.address}
              onChange={(e) => setStops((rows) => rows.map((r, j) => (j === i ? { ...r, address: e.target.value } : r)))}
            />
            <button
              type="button"
              className={buttonClass('ghost', 'sm')}
              onClick={() => setStops((rows) => rows.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() => setStops((rows) => [...rows, { label: '', address: '' }])}
        >
          Add a stop
        </button>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          checked={returnToStart}
          onChange={(e) => setReturnToStart(e.target.checked)}
          className="h-4 w-4 accent-apex"
        />
        Round trip — ended back at the starting point
      </label>
      {!returnToStart && <InputField label="Ending point" value={endAddress} onChange={setEndAddress} />}

      <SelectField
        label="How were the miles measured?"
        value={source}
        onChange={(v) => setSource(v as TripSource)}
        options={SOURCES.map((s) => ({ ...s, disabled: s.value === 'gps' && source !== 'gps' }))}
        hint={
          source === 'route'
            ? 'Uses OpenStreetMap driving directions through the addresses above, in order.'
            : undefined
        }
      />

      {source === 'odometer' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <InputField
              label="Odometer start"
              value={odoStart}
              inputMode="numeric"
              onChange={(v) => setOdoStart(v.replace(/[^0-9]/g, ''))}
              error={errors.odometerStart}
            />
            {photoButton('Photo of start reading', startKey, setStartKey, startPhotoRef)}
          </div>
          <div className="space-y-2">
            <InputField
              label="Odometer end"
              value={odoEnd}
              inputMode="numeric"
              onChange={(v) => setOdoEnd(v.replace(/[^0-9]/g, ''))}
              error={errors.odometerEnd}
            />
            {photoButton('Photo of end reading', endKey, setEndKey, endPhotoRef)}
          </div>
        </div>
      ) : source !== 'route' ? (
        <InputField
          label="Miles"
          value={miles}
          inputMode="decimal"
          placeholder="0.0"
          onChange={(v) => setMiles(v.replace(/[^0-9.]/g, ''))}
          error={errors.miles}
          hint="Leave blank to fill in later — the trip stays flagged until you do."
        />
      ) : null}

      <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={2} placeholder="Optional" />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || uploading || !purpose.trim() || !tripDate}
          onClick={submit}
          className={buttonClass('primary', 'sm')}
        >
          {pending ? 'Saving…' : trip ? 'Save trip' : 'Log trip'}
        </button>
        <button type="button" onClick={onDone} className={clsx(buttonClass('ghost', 'sm'))}>
          Cancel
        </button>
      </div>
    </div>
  );
}

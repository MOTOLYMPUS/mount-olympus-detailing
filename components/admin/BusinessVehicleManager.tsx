'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The business's vehicles — what the mileage log drives.
//
// Each vehicle carries its own IRS method: standard mileage (business miles ×
// the year's rate) or actual expenses (miles only here; costs go on the
// expense ledger). Odometer readings per tax year give total miles, and so the
// business-use %. A qualified nonpersonal-use vehicle is 100% business.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, buttonClass } from '@/components/ui';
import { InputField, SelectField, TextAreaField } from '@/components/Field';
import type { BusinessVehicle } from '@/lib/models';

interface YearRow {
  taxYear: string;
  odometerStart: string;
  odometerEnd: string;
}

const s = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
const digits = (v: string) => v.replace(/[^0-9]/g, '');

function VehicleForm({ vehicle, onDone }: { vehicle?: BusinessVehicle; onDone: () => void }) {
  const router = useRouter();
  const [description, setDescription] = useState(vehicle?.description ?? '');
  const [ownership, setOwnership] = useState<string>(vehicle?.ownership ?? 'business');
  const [method, setMethod] = useState<string>(vehicle?.deductionMethod ?? 'standard');
  const [qualified, setQualified] = useState(vehicle?.qualifiedNonpersonal ?? false);
  const [isDefault, setIsDefault] = useState(vehicle?.isDefault ?? false);
  const [placedOn, setPlacedOn] = useState(vehicle?.placedInServiceOn ?? '');
  const [odoInService, setOdoInService] = useState(s(vehicle?.odometerInService));
  const [activeFrom, setActiveFrom] = useState(vehicle?.activeFrom ?? '');
  const [retiredOn, setRetiredOn] = useState(vehicle?.retiredOn ?? '');
  const [notes, setNotes] = useState(vehicle?.notes ?? '');
  const [years, setYears] = useState<YearRow[]>(
    (vehicle?.years ?? []).map((y) => ({ taxYear: String(y.taxYear), odometerStart: s(y.odometerStart), odometerEnd: s(y.odometerEnd) }))
  );
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    setPending(true);
    setBanner('');
    setErrors({});
    try {
      const res = await fetch(vehicle ? `/api/mileage/vehicles/${vehicle.id}` : '/api/mileage/vehicles', {
        method: vehicle ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          ownership,
          deductionMethod: method,
          qualifiedNonpersonal: qualified,
          isDefault,
          placedInServiceOn: placedOn || null,
          odometerInService: odoInService,
          activeFrom: activeFrom || null,
          retiredOn: retiredOn || null,
          notes,
          years: years
            .filter((y) => y.taxYear.trim())
            .map((y) => ({ taxYear: Number(y.taxYear), odometerStart: y.odometerStart, odometerEnd: y.odometerEnd })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setBanner(data.error ?? 'That did not save.');
        setErrors(data.errors ?? {});
        return;
      }
      router.refresh();
      onDone();
    } catch {
      setBanner('We could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-sm border border-white/10 bg-white/[0.02] p-4">
      {banner && <Alert tone="danger">{banner}</Alert>}
      <InputField
        label="Vehicle"
        value={description}
        onChange={setDescription}
        required
        error={errors.description}
        placeholder="2015 Ford Transit Connect"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Owned by"
          value={ownership}
          onChange={setOwnership}
          options={[
            { value: 'business', label: 'The business (titled to the LLC)' },
            { value: 'personal', label: 'Me personally' },
          ]}
        />
        <SelectField
          label="Deduction method"
          value={method}
          onChange={setMethod}
          options={[
            { value: 'standard', label: 'Standard mileage' },
            { value: 'actual', label: 'Actual expenses' },
          ]}
          hint={
            method === 'standard'
              ? 'Business miles × the IRS rate. Gas, oil and repairs are not deducted separately.'
              : 'Fuel, insurance, repairs and depreciation go on the expense ledger; miles here support business use.'
          }
        />
        <InputField label="Placed in service for business" type="date" value={placedOn} onChange={setPlacedOn} error={errors.placedInServiceOn} />
        <InputField
          label="Odometer when placed in service"
          value={odoInService}
          inputMode="numeric"
          onChange={(v) => setOdoInService(digits(v))}
          error={errors.odometerInService}
        />
        <InputField
          label="First day used for jobs"
          type="date"
          value={activeFrom}
          onChange={setActiveFrom}
          error={errors.activeFrom}
          hint="Job trips on or after this day use this vehicle."
        />
        <InputField
          label="Last day used (retired)"
          type="date"
          value={retiredOn}
          onChange={setRetiredOn}
          error={errors.retiredOn}
          hint="Leave blank while it is still in use."
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="mt-0.5 h-4 w-4 accent-apex" />
        <span>Default for job trips while in use (if two vehicles overlap)</span>
      </label>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" checked={qualified} onChange={(e) => setQualified(e.target.checked)} className="mt-0.5 h-4 w-4 accent-apex" />
        <span>
          Qualified nonpersonal-use vehicle — front seats only, permanent shelving, equipment carried at all
          times, logos outside. Counted as 100% business use; your preparer confirms.
        </span>
      </label>

      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">Odometer by tax year</p>
        <p className="text-[12px] text-subtle">
          Jan 1 and Dec 31 readings give total miles for the year (Schedule C Part IV). Leave Jan 1 blank in the
          year it was placed in service to use that reading.
        </p>
        {years.map((y, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              className="input-field max-w-[6rem]"
              inputMode="numeric"
              placeholder="Year"
              aria-label={`Row ${i + 1} tax year`}
              value={y.taxYear}
              onChange={(e) => setYears((r) => r.map((x, j) => (j === i ? { ...x, taxYear: digits(e.target.value) } : x)))}
            />
            <input
              className="input-field max-w-[9rem]"
              inputMode="numeric"
              placeholder="Jan 1 reading"
              aria-label={`Row ${i + 1} January 1 odometer`}
              value={y.odometerStart}
              onChange={(e) => setYears((r) => r.map((x, j) => (j === i ? { ...x, odometerStart: digits(e.target.value) } : x)))}
            />
            <input
              className="input-field max-w-[9rem]"
              inputMode="numeric"
              placeholder="Dec 31 reading"
              aria-label={`Row ${i + 1} December 31 odometer`}
              value={y.odometerEnd}
              onChange={(e) => setYears((r) => r.map((x, j) => (j === i ? { ...x, odometerEnd: digits(e.target.value) } : x)))}
            />
            <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setYears((r) => r.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={buttonClass('secondary', 'sm')}
          onClick={() => setYears((r) => [...r, { taxYear: String(new Date().getFullYear()), odometerStart: '', odometerEnd: '' }])}
        >
          Add a year
        </button>
      </div>

      <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={2} placeholder="Optional" />

      <div className="flex gap-2">
        <button type="button" disabled={pending || !description.trim()} onClick={submit} className={buttonClass('primary', 'sm')}>
          {pending ? 'Saving…' : vehicle ? 'Save vehicle' : 'Add vehicle'}
        </button>
        <button type="button" onClick={onDone} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function BusinessVehicleManager({ vehicles }: { vehicles: BusinessVehicle[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function remove(v: BusinessVehicle) {
    if (!confirm(`Remove ${v.description}? Its trips stay in the log without a vehicle.`)) return;
    setError('');
    const res = await fetch(`/api/mileage/vehicles/${v.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) setError('That vehicle could not be removed.');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      {vehicles.length === 0 && editing !== 'new' && (
        <p className="text-[13px] text-subtle">
          No vehicles yet. Add the one you drive to jobs so trips can be assigned to it.
        </p>
      )}
      <ul className="space-y-2">
        {vehicles.map((v) =>
          editing === v.id ? (
            <li key={v.id}>
              <VehicleForm vehicle={v} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0">
              <div className="min-w-0">
                <p className="text-sm text-white">{v.description}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{v.ownership === 'business' ? 'Business-owned' : 'Personal'}</Badge>
                  <Badge tone="info">{v.deductionMethod === 'standard' ? 'Standard mileage' : 'Actual expenses'}</Badge>
                  {v.qualifiedNonpersonal && <Badge tone="positive">100% business</Badge>}
                  {v.isDefault && <Badge tone="neutral">Default</Badge>}
                  {v.retiredOn && <Badge tone="warning">Retired {v.retiredOn}</Badge>}
                </div>
                <p className="mt-1 text-[12px] text-subtle">
                  {v.activeFrom ? `In use from ${v.activeFrom}` : 'In use'}
                  {v.placedInServiceOn ? ` · placed in service ${v.placedInServiceOn}` : ''}
                  {v.odometerInService !== null ? ` at ${v.odometerInService.toLocaleString()} mi` : ''}
                </p>
              </div>
              <div className="flex gap-1">
                <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setEditing(v.id)}>
                  Edit
                </button>
                <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => remove(v)}>
                  Remove
                </button>
              </div>
            </li>
          )
        )}
      </ul>
      {editing === 'new' ? (
        <VehicleForm onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setEditing('new')}>
          + Add vehicle
        </button>
      )}
    </div>
  );
}

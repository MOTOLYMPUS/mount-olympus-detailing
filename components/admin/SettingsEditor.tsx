'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The business settings editor.
//
// These fields drive lib/availability.ts. A wrong number here does not produce
// a cosmetic bug — it sells a slot that does not exist, or hides every slot
// there is. So each control states its CONSEQUENCE in the hint, not its
// definition: "how long before a booking we stop accepting it", not
// "minimum notice hours".
//
// Every value is re-validated and CLAMPED by /api/admin/settings. The `min` and
// `max` attributes here are a courtesy; the range in the route is the rule.
//
// Business hours are minutes from local midnight in the database and 'HH:mm' in
// the browser. The conversion lives in this file, in one pair of functions, so
// there is no chance of one field converting and another not.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, CardTitle, buttonClass } from '@/components/ui';
import { BusinessHours, Holiday, MembershipPlan, ServiceArea } from '@/lib/models';
import { SchedulingConfig } from '@/lib/repo/settings';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** A short, curated zone list plus whatever is already configured. */
const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
];

interface DayRow {
  open: boolean;
  start: string;
  end: string;
}

function Number_({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="input-field"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="text-[12px] leading-snug text-subtle">{hint}</p>
    </div>
  );
}

export default function SettingsEditor({
  config,
  holidays: initialHolidays,
  areas: initialAreas,
  plans: initialPlans,
}: {
  config: SchedulingConfig;
  holidays: Holiday[];
  areas: ServiceArea[];
  plans: MembershipPlan[];
}) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [days, setDays] = useState<DayRow[]>(() =>
    WEEKDAYS.map((_, i) => {
      const hours = config.businessHours[String(i)];
      return {
        open: !!hours,
        start: toTime(hours?.start ?? 8 * 60),
        end: toTime(hours?.end ?? 17 * 60),
      };
    })
  );

  const [timezone, setTimezone] = useState(config.timezone);
  const [slot, setSlot] = useState(config.slotIntervalMinutes);
  const [buffer, setBuffer] = useState(config.bufferMinutes);
  const [travel, setTravel] = useState(config.defaultTravelMinutes);
  const [notice_, setNoticeHours] = useState(config.minNoticeHours);
  const [advance, setAdvance] = useState(config.maxAdvanceDays);
  const [cancel, setCancel] = useState(config.cancellationNoticeHours);
  const [deposit, setDeposit] = useState(config.depositPercent);

  const [holidays, setHolidays] = useState(initialHolidays);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayLabel, setHolidayLabel] = useState('');

  const [areas, setAreas] = useState(initialAreas);
  const [areaName, setAreaName] = useState('');
  const [areaCodes, setAreaCodes] = useState('');
  const [areaTravel, setAreaTravel] = useState(30);
  const [areaSurcharge, setAreaSurcharge] = useState(0);

  const [plans, setPlans] = useState(initialPlans);
  const [planName, setPlanName] = useState('');

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That did not save.');
        return null;
      }
      return data;
    } catch {
      setError('We could not reach the server.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  const timezoneOptions = TIMEZONES.includes(config.timezone)
    ? TIMEZONES
    : [config.timezone, ...TIMEZONES];

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && !error && <Alert tone="positive">{notice}</Alert>}

      {/* ── Hours ── */}
      <Card>
        <CardTitle>Opening hours</CardTitle>

        <ul className="space-y-2">
          {WEEKDAYS.map((label, i) => (
            <li key={label} className="flex flex-wrap items-center gap-3">
              <label className="flex w-32 shrink-0 items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-apex"
                  checked={days[i].open}
                  disabled={busy}
                  onChange={(e) =>
                    setDays((d) => d.map((x, j) => (j === i ? { ...x, open: e.target.checked } : x)))
                  }
                />
                {label}
              </label>
              <input
                type="time"
                className="input-field max-w-[8rem]"
                value={days[i].start}
                disabled={busy || !days[i].open}
                aria-label={`${label} opening time`}
                onChange={(e) =>
                  setDays((d) => d.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                }
              />
              <span className="text-subtle">to</span>
              <input
                type="time"
                className="input-field max-w-[8rem]"
                value={days[i].end}
                disabled={busy || !days[i].open}
                aria-label={`${label} closing time`}
                onChange={(e) =>
                  setDays((d) => d.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                }
              />
              {!days[i].open && <span className="text-[12px] text-subtle">Closed</span>}
            </li>
          ))}
        </ul>
      </Card>

      {/* ── Scheduling policy ── */}
      <Card>
        <CardTitle>Scheduling policy</CardTitle>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tz" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Timezone
            </label>
            <select
              id="tz"
              className="input-field"
              value={timezone}
              disabled={busy}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-[12px] leading-snug text-subtle">
              Every time shown to a customer is rendered in this zone. Changing it does not move
              existing bookings — they are stored as absolute instants.
            </p>
          </div>

          <Number_
            label="Slot interval"
            hint="How far apart offered start times are, in minutes. 30 keeps the calendar readable."
            value={slot}
            min={15}
            max={240}
            disabled={busy}
            onChange={setSlot}
          />
          <Number_
            label="Buffer minutes"
            hint="Held after every job for clean-up. Shortening this packs the day tighter and makes overruns cascade."
            value={buffer}
            min={0}
            max={240}
            disabled={busy}
            onChange={setBuffer}
          />
          <Number_
            label="Default travel minutes"
            hint="Used for mobile jobs outside a defined service area."
            value={travel}
            min={0}
            max={240}
            disabled={busy}
            onChange={setTravel}
          />
          <Number_
            label="Minimum notice hours"
            hint="How close to the start a customer may still book. Too low and you get a job you cannot resource."
            value={notice_}
            min={0}
            max={720}
            disabled={busy}
            onChange={setNoticeHours}
          />
          <Number_
            label="Maximum advance days"
            hint="How far ahead the calendar is open."
            value={advance}
            min={1}
            max={365}
            disabled={busy}
            onChange={setAdvance}
          />
          <Number_
            label="Cancellation notice hours"
            hint="Free cancellation window. Staff can always override it; customers cannot."
            value={cancel}
            min={0}
            max={336}
            disabled={busy}
            onChange={setCancel}
          />
          <Number_
            label="Deposit percent"
            hint="Share of the quote taken up front. 0 disables deposits."
            value={deposit}
            min={0}
            max={100}
            disabled={busy}
            onChange={setDeposit}
          />
        </div>

        <button
          type="button"
          disabled={busy}
          className={buttonClass('primary', 'sm', 'mt-4')}
          onClick={async () => {
            const businessHours: BusinessHours = {};
            for (let i = 0; i <= 6; i++) {
              const row = days[i];
              businessHours[String(i)] =
                row.open && toMinutes(row.end) > toMinutes(row.start)
                  ? { start: toMinutes(row.start), end: toMinutes(row.end) }
                  : null;
            }

            const data = await call('/api/admin/settings', 'PATCH', {
              business_hours: businessHours,
              timezone,
              slot_interval_minutes: slot,
              buffer_minutes: buffer,
              default_travel_minutes: travel,
              min_notice_hours: notice_,
              max_advance_days: advance,
              cancellation_notice_hours: cancel,
              deposit_percent: deposit,
            });
            if (data) {
              setNotice('Settings saved. The booking calendar uses them immediately.');
              router.refresh();
            }
          }}
        >
          Save hours and policy
        </button>
      </Card>

      {/* ── Holidays ── */}
      <Card>
        <CardTitle>Closures</CardTitle>

        {holidays.length === 0 ? (
          <p className="py-2 text-[13px] text-subtle">No closures set.</p>
        ) : (
          <ul className="mb-4 space-y-1.5">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-muted">
                  <span className="font-mono text-white">{h.date}</span> · {h.label}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  className={buttonClass('ghost', 'sm')}
                  onClick={async () => {
                    const data = await call(`/api/admin/holidays?id=${h.id}`, 'DELETE');
                    if (data) setHolidays(data.holidays);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hol-date" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Date
            </label>
            <input
              id="hol-date"
              type="date"
              className="input-field"
              value={holidayDate}
              disabled={busy}
              onChange={(e) => setHolidayDate(e.target.value)}
            />
          </div>
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <label htmlFor="hol-label" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Reason
            </label>
            <input
              id="hol-label"
              className="input-field"
              value={holidayLabel}
              disabled={busy}
              placeholder="Thanksgiving"
              onChange={(e) => setHolidayLabel(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={busy || !holidayDate}
            className={buttonClass('secondary', 'sm')}
            onClick={async () => {
              const data = await call('/api/admin/holidays', 'POST', {
                date: holidayDate,
                label: holidayLabel,
              });
              if (data) {
                setHolidays(data.holidays);
                setHolidayDate('');
                setHolidayLabel('');
              }
            }}
          >
            Add closure
          </button>
        </div>
      </Card>

      {/* ── Service areas ── */}
      <Card>
        <CardTitle>Service areas</CardTitle>

        {areas.length === 0 ? (
          <p className="py-2 text-[13px] text-subtle">
            None defined — mobile jobs use the default travel time above.
          </p>
        ) : (
          <ul className="mb-4 space-y-2">
            {areas.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    {a.name}
                    {!a.active && <span className="ml-2 font-mono text-[10px] uppercase text-flare">retired</span>}
                  </p>
                  <p className="truncate text-[12px] text-subtle">
                    {a.travelMinutes} min travel
                    {a.surchargeCents ? ` · $${(a.surchargeCents / 100).toFixed(2)} surcharge` : ''}
                    {a.postalCodes.length ? ` · ${a.postalCodes.join(', ')}` : ''}
                  </p>
                </div>
                {a.active && (
                  <button
                    type="button"
                    disabled={busy}
                    className={buttonClass('ghost', 'sm')}
                    onClick={async () => {
                      const data = await call(`/api/admin/service-areas?id=${a.id}`, 'DELETE');
                      if (data) setAreas(data.areas);
                    }}
                  >
                    Retire
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="area-name" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Name
            </label>
            <input
              id="area-name"
              className="input-field"
              value={areaName}
              disabled={busy}
              onChange={(e) => setAreaName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="area-codes" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Postal codes
            </label>
            <input
              id="area-codes"
              className="input-field"
              value={areaCodes}
              disabled={busy}
              placeholder="75001, 75002"
              onChange={(e) => setAreaCodes(e.target.value)}
            />
          </div>
          <Number_
            label="Travel minutes"
            hint="Held either side of every job in this area."
            value={areaTravel}
            min={0}
            max={480}
            disabled={busy}
            onChange={setAreaTravel}
          />
          <Number_
            label="Surcharge cents"
            hint="Added to the quote. 0 for none."
            value={areaSurcharge}
            min={0}
            max={100000}
            disabled={busy}
            onChange={setAreaSurcharge}
          />
        </div>

        <button
          type="button"
          disabled={busy || !areaName}
          className={buttonClass('secondary', 'sm', 'mt-3')}
          onClick={async () => {
            const data = await call('/api/admin/service-areas', 'POST', {
              name: areaName,
              postalCodes: areaCodes.split(/[,\s]+/).filter(Boolean),
              travelMinutes: areaTravel,
              surchargeCents: areaSurcharge,
              active: true,
            });
            if (data) {
              setAreas(data.areas);
              setAreaName('');
              setAreaCodes('');
            }
          }}
        >
          Add service area
        </button>

        <p className="mt-3 text-[12px] leading-relaxed text-subtle">
          Retiring an area hides it from new bookings but keeps it on historical ones, so past
          travel times still make sense in reports.
        </p>
      </Card>

      {/* ── Membership plans ── */}
      <Card>
        <CardTitle>Membership plans</CardTitle>

        {plans.length === 0 ? (
          <p className="py-2 text-[13px] text-subtle">No plans defined.</p>
        ) : (
          <ul className="space-y-2">
            {plans.map((p, index) => (
              <li key={p.id} className="border-b border-white/5 py-3 last:border-0">
                <div className="grid gap-2 sm:grid-cols-4">
                  <input
                    className="input-field sm:col-span-2"
                    value={p.name}
                    disabled={busy}
                    aria-label={`Plan ${index + 1} name`}
                    onChange={(e) =>
                      setPlans((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, name: e.target.value } : r))
                      )
                    }
                  />
                  <input
                    className="input-field"
                    inputMode="decimal"
                    value={(p.priceCents / 100).toString()}
                    disabled={busy}
                    aria-label={`Plan ${index + 1} price in dollars`}
                    onChange={(e) =>
                      setPlans((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, priceCents: Math.round((Number(e.target.value) || 0) * 100) }
                            : r
                        )
                      )
                    }
                  />
                  <input
                    className="input-field"
                    inputMode="numeric"
                    value={String(p.discountPct)}
                    disabled={busy}
                    aria-label={`Plan ${index + 1} discount percent`}
                    onChange={(e) =>
                      setPlans((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, discountPct: Number(e.target.value) || 0 } : r
                        )
                      )
                    }
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className={buttonClass('secondary', 'sm')}
                    onClick={async () => {
                      const data = await call('/api/admin/plans', 'POST', p);
                      if (data) {
                        setPlans(data.plans);
                        setNotice(`${p.name} saved.`);
                      }
                    }}
                  >
                    Save plan
                  </button>
                  <span className="text-[12px] text-subtle">
                    {p.interval} · {p.active ? 'active' : 'retired'} · a member&rsquo;s discount
                    replaces their loyalty-tier discount whenever it is larger; the two never stack.
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <label htmlFor="plan-name" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              New plan name
            </label>
            <input
              id="plan-name"
              className="input-field"
              value={planName}
              disabled={busy}
              placeholder="Monthly maintenance"
              onChange={(e) => setPlanName(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={busy || !planName}
            className={buttonClass('secondary', 'sm')}
            onClick={async () => {
              const data = await call('/api/admin/plans', 'POST', {
                name: planName,
                description: '',
                priceCents: 0,
                interval: 'month',
                discountPct: 0,
                included: [],
                active: true,
              });
              if (data) {
                setPlans(data.plans);
                setPlanName('');
                setNotice('Plan created. Set its price and discount above, then save it.');
              }
            }}
          >
            Create plan
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-subtle">
          The discount is capped at 50%. It applies to every booking a member makes for as long as
          the plan is active, so a mistyped figure is expensive and silent.
        </p>
      </Card>
    </div>
  );
}

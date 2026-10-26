'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Expense ledger (admin only).
//
// Entry is <ExpenseLogger> — the same form Reports uses, so there is exactly
// one way to log a spend. This file is the table underneath it: the year's
// entries with job, receipt and delete. Marketing rows also show the drive to
// the event and its photos, and open an "Event" panel to add or change them.
//
// After a delete it calls router.refresh(): the list, the category totals and
// the finance hub are all server-rendered from the same table, so a refresh
// keeps every one of them in agreement without a second source of truth.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExpenseLogger, { JobOption } from '@/components/admin/ExpenseLogger';
import EventExtras, { EventExtrasValue, eventExtrasBody } from '@/components/admin/EventExtras';
import type { VehicleOption } from '@/components/admin/TripEditor';
import { Alert, buttonClass } from '@/components/ui';
import { Expense, ExpenseCategoryDef, expenseCategoryLabel } from '@/lib/models';
import { formatMoney } from '@/lib/pricing';

function extrasFrom(e: Expense, baseAddress: string): EventExtrasValue {
  return {
    mileageOn: !!e.trip,
    from: e.trip?.from ?? baseAddress,
    to: e.trip?.to ?? '',
    roundTrip: e.trip?.roundTrip ?? true,
    vehicleId: e.trip?.businessVehicleId ?? '',
    miles: e.trip?.manualMiles && e.trip.milesTenths !== null ? (e.trip.milesTenths / 10).toFixed(1) : '',
    photoKeys: e.photoKeys,
  };
}

/** Inline editor for one expense's event mileage and photos. */
function EventPanel({
  expense,
  vehicles,
  baseAddress,
  onDone,
}: {
  expense: Expense;
  vehicles: VehicleOption[];
  baseAddress: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(() => extrasFrom(expense, baseAddress));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventExtrasBody(value)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That did not save.');
        setErrors(data.errors ?? {});
        return;
      }
      router.refresh();
      onDone();
    } catch {
      setError('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <EventExtras
        value={value}
        onChange={setValue}
        vehicles={vehicles}
        date={expense.spentOn}
        errors={errors}
        onBusy={setBusy}
        onError={setError}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || (value.mileageOn && !value.to.trim())}
          onClick={save}
          className={buttonClass('primary', 'sm')}
        >
          {busy ? 'Saving…' : 'Save event details'}
        </button>
        <button type="button" onClick={onDone} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ExpenseManager({
  initial,
  categories,
  jobs,
  /** appointment id → reference, for the Job column. */
  jobRefs,
  exportHref,
  exportLabel = 'Export CSV',
  vehicles,
  baseAddress = '',
}: {
  initial: Expense[];
  categories: ExpenseCategoryDef[];
  jobs: JobOption[];
  jobRefs: Record<string, string>;
  /**
   * When set, the ledger is headed by this CSV export link instead of the
   * logger — the page then renders <ExpenseLogger> itself (Expenses puts it
   * full-width under the title).
   */
  exportHref?: string;
  exportLabel?: string;
  /** Business vehicles; enables the event mileage + photos panel. */
  vehicles?: VehicleOption[];
  baseAddress?: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const editing = initial.find((e) => e.id === eventId) ?? null;
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (eventId) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [eventId]);

  async function remove(id: string) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {exportHref ? (
        <a href={exportHref} className={buttonClass('secondary', 'sm')}>
          {exportLabel}
        </a>
      ) : (
        <ExpenseLogger categories={categories} jobs={jobs} vehicles={vehicles} baseAddress={baseAddress} />
      )}

      {/* Outside the table: the ledger scrolls sideways on a phone, and a
          panel inside it would scroll out of view with the columns. */}
      {vehicles && editing && (
        <div ref={panelRef} className="scroll-mt-20 space-y-2 rounded-sm border border-white/10 bg-white/[0.02] p-4">
          <p className="text-sm text-white">
            Event details · {editing.vendor || expenseCategoryLabel(editing.category)} ·{' '}
            <span className="font-mono text-[12px] text-muted">{editing.spentOn}</span>
          </p>
          <EventPanel
            key={editing.id}
            expense={editing}
            vehicles={vehicles}
            baseAddress={baseAddress}
            onDone={() => setEventId(null)}
          />
        </div>
      )}

      {initial.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No expenses recorded for this period yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                <th className="px-3 py-2.5 font-normal">Date</th>
                <th className="px-3 py-2.5 font-normal">Category</th>
                <th className="px-3 py-2.5 font-normal">Vendor</th>
                <th className="px-3 py-2.5 font-normal">Job</th>
                <th className="px-3 py-2.5 text-right font-normal">Amount</th>
                <th className="px-3 py-2.5 text-center font-normal">Deduct.</th>
                <th className="px-3 py-2.5 text-center font-normal">Receipt</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {initial.map((e) => (
                <tr key={e.id} className="text-white/90">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px]">{e.spentOn}</td>
                  <td className="px-3 py-2.5">
                    {expenseCategoryLabel(e.category)}
                    {e.note && <span className="block text-[12px] text-subtle">{e.note}</span>}
                    {e.trip && (
                      <Link
                        href="/admin/mileage"
                        className={`mt-1 block text-[12px] ${e.trip.needsReview ? 'text-amber-300' : 'text-muted'} hover:text-white`}
                      >
                        🚗 {e.trip.milesTenths === null ? 'miles pending' : `${(e.trip.milesTenths / 10).toFixed(1)} mi`}
                        {e.trip.roundTrip ? ' round trip' : ' one way'} to {e.trip.to}
                        {e.trip.needsReview && e.trip.reviewReason ? ` — ${e.trip.reviewReason}` : ''}
                      </Link>
                    )}
                    {e.photoKeys.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.photoKeys.map((key) => (
                          <a key={key} href={`/api/files/${key}`} target="_blank" rel="noreferrer noopener">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/files/${key}`}
                              alt="Event photo"
                              loading="lazy"
                              className="h-10 w-10 rounded-sm border border-white/10 object-cover"
                            />
                          </a>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{e.vendor || '—'}</td>
                  <td className="px-3 py-2.5">
                    {e.appointmentId ? (
                      <Link
                        href={`/admin/appointments/${e.appointmentId}`}
                        className="font-mono text-[12px] text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                      >
                        {jobRefs[e.appointmentId] ?? 'Job'}
                      </Link>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{formatMoney(e.amountCents)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {e.deductible ? (
                      <span className="text-emerald-400" aria-label="Deductible">
                        ✓
                      </span>
                    ) : (
                      <span className="text-subtle" aria-label="Not deductible">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {e.receiptKey ? (
                      <a
                        href={`/api/files/${e.receiptKey}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[12px] text-flare hover:text-white"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {vehicles && (e.category === 'advertising' || e.trip || e.photoKeys.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setEventId(eventId === e.id ? null : e.id)}
                        className="mr-3 text-[12px] text-subtle transition-colors hover:text-white"
                      >
                        Event
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      disabled={busyId === e.id}
                      className="text-[12px] text-subtle transition-colors hover:text-apex disabled:opacity-50"
                    >
                      {busyId === e.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The quoted price of a booking, editable in place by a manager.
//
// PATCH /api/appointments/:id { quotedTotal } — lib/invoicing.repriceBooking
// owns the consequences (an unpaid invoice is voided and re-raised at the new
// figure; a paid one refuses). `router.refresh()` afterwards so the balance,
// the invoice number and the customer's history all re-read from the database.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonClass } from '@/components/ui';
import { formatCurrency } from '@/lib/pricing';

export default function PriceEditor({
  appointmentId,
  quotedTotal,
  quotedTotalMax,
  /** A paid invoice or a cancelled booking: show the figure, no edit control. */
  locked = false,
  /** Why it is locked, shown under the figure. */
  lockedReason,
}: {
  appointmentId: string;
  quotedTotal: number;
  quotedTotalMax: number;
  locked?: boolean;
  lockedReason?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(quotedTotal.toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const shown =
    quotedTotalMax > quotedTotal
      ? `${formatCurrency(quotedTotal)} – ${formatCurrency(quotedTotalMax)}`
      : formatCurrency(quotedTotal);

  async function save() {
    const total = Number(value);
    if (!Number.isFinite(total) || total < 0) {
      setError('Enter a valid price.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotedTotal: total }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That did not save.');
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError('No connection.');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5">
        <span>{shown}</span>
        {locked ? (
          lockedReason && <span className="text-[11px] text-subtle">{lockedReason}</span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setValue(quotedTotal.toFixed(2));
              setEditing(true);
            }}
            className="text-[12px] text-muted underline decoration-white/20 underline-offset-4 hover:text-white"
          >
            Edit price
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <span className="flex items-stretch gap-1.5">
        <span className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-subtle">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setEditing(false);
            }}
            aria-label="Quoted price in dollars"
            className="input-field w-[7.5rem] py-2 pl-7 pr-2 text-right font-mono"
          />
        </span>
        <button type="button" disabled={busy} onClick={save} className={buttonClass('primary', 'sm')}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(false)}
          className={buttonClass('ghost', 'sm')}
        >
          Cancel
        </button>
      </span>
      {error && <span className="text-[12px] text-flare">{error}</span>}
      <span className="text-[11px] leading-snug text-subtle">
        Replaces the quoted total. An unpaid invoice is re-sent at the new price.
      </span>
    </span>
  );
}

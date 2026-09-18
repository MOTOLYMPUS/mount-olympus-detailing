'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Assign / reschedule / cancel / complete, for one appointment.
//
// Everything here goes through the EXISTING /api/appointments/:id route rather
// than a new admin-only endpoint. That route already owns the hard parts —
// double-booking checks via `assertBookable`, the loyalty award on completion,
// the customer emails — and a parallel admin path would be a second place for
// those rules to drift out of sync.
//
// `router.refresh()` after every success re-runs the server component that
// rendered this row, so the status badge, the technician name and the schedule
// counts all update from the database rather than from optimistic guesses. A
// booking's state is consequential enough that the screen should show what was
// actually stored.
//
// LAYOUT (the detail screen, `full`): every row spans the card, phone-first —
//   [ Complete & send invoice ][ Complete & close ]
//   [ Assign technician ▾                          ]
//   [ Move to ······················ ][ Reschedule ]
//   [ Confirmed ][ Cancel ][ No show ]
// "Complete & close" is for a job already paid on the day: it asks how, and
// records the balance as settled so the ledger and the review gate agree.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, buttonClass } from '@/components/ui';
import { AppointmentStatus } from '@/lib/models';

export interface TechnicianOption {
  id: string;
  name: string;
}

async function post(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, error: data.error as string | undefined };
}

type PaymentChoice = 'none' | 'cash' | 'zelle' | 'card' | 'other';

const PAYMENT_CHOICES: { value: PaymentChoice; label: string }[] = [
  { value: 'none', label: 'Not received yet' },
  { value: 'cash', label: 'Received — cash' },
  { value: 'zelle', label: 'Received — Zelle' },
  { value: 'card', label: 'Received — card (outside the app)' },
  { value: 'other', label: 'Received — other' },
];

export default function AppointmentActions({
  appointmentId,
  employeeId,
  status,
  technicians,
  /** The detail screen shows reschedule and status controls; a list row does not. */
  full = false,
  startsAtLocalValue,
  invoiceStatus = 'none',
}: {
  appointmentId: string;
  employeeId: string | null;
  status: AppointmentStatus;
  technicians: TechnicianOption[];
  full?: boolean;
  /** 'YYYY-MM-DDTHH:mm' in the business timezone, for the datetime-local input. */
  startsAtLocalValue?: string;
  /** The invoice that stands for this booking, if any — drives the invoice button. */
  invoiceStatus?: 'none' | 'sent' | 'paid';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [when, setWhen] = useState(startsAtLocalValue ?? '');
  const [closing, setClosing] = useState(false);
  const [payment, setPayment] = useState<PaymentChoice>('cash');

  const closed = status === 'cancelled' || status === 'completed';
  const dead = status === 'cancelled' || status === 'no_show';
  // "Complete & send invoice" (or just "Send invoice" once completed) is
  // offered until an invoice stands; a paid one has nothing left to do.
  const canInvoice = !dead && invoiceStatus === 'none';
  // "Complete & close" (or "Record payment" once completed) until it is paid.
  const canClose = !dead && invoiceStatus !== 'paid';

  async function completeAndInvoice() {
    const msg =
      status === 'completed'
        ? 'Send the invoice for this job? The customer is emailed a link to pay.'
        : 'Complete this job and send the invoice? Points are awarded and the customer is emailed a link to pay.';
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/invoice`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That did not work.');
        return;
      }
      setNotice(
        data.cardPayments
          ? `Invoice ${data.invoice.number} sent — the customer can pay by card from the app.`
          : `Invoice ${data.invoice.number} sent. Card payments are not set up yet, so record cash or Zelle when it arrives.`
      );
      router.refresh();
    } catch {
      setError('No connection.');
    } finally {
      setBusy(false);
    }
  }

  async function completeAndClose() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          paymentReceived: payment !== 'none',
          ...(payment !== 'none' ? { paymentMethod: payment } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That did not work.');
        return;
      }
      setClosing(false);
      setNotice(
        payment === 'none'
          ? 'Job completed. No payment recorded yet.'
          : data.payment
            ? `Job completed and $${(data.payment.amountCents / 100).toFixed(2)} recorded as paid.`
            : 'Job completed. The balance was already covered.'
      );
      router.refresh();
    } catch {
      setError('No connection.');
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError('');
    const result = await fn().catch(() => ({ ok: false, error: 'No connection.' }));
    if (!result.ok) setError(result.error ?? 'That did not work.');
    else router.refresh();
    setBusy(false);
  }

  function cancelBooking() {
    const reason = window.prompt('Why is this being cancelled? The customer is emailed.');
    // `null` is the Cancel button on the prompt; an empty string is a
    // deliberate blank. Only the former aborts.
    if (reason === null) return;
    void run(() =>
      post(
        `/api/appointments/${appointmentId}?reason=${encodeURIComponent(reason || 'Cancelled by the shop')}`,
        'DELETE'
      )
    );
  }

  const invoiceBadge =
    invoiceStatus === 'sent' ? (
      <span className="inline-flex items-center justify-center rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-widest2 text-amber-200">
        Invoice sent · awaiting payment
      </span>
    ) : invoiceStatus === 'paid' ? (
      <span className="inline-flex items-center justify-center rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-widest2 text-emerald-300">
        Invoice paid
      </span>
    ) : null;

  const assign = (
    <>
      <label className="sr-only" htmlFor={`tech-${appointmentId}`}>
        Assign technician
      </label>
      <select
        id={`tech-${appointmentId}`}
        className={full ? 'input-field' : 'input-field max-w-[14rem]'}
        value={employeeId ?? ''}
        disabled={busy || closed}
        onChange={(e) =>
          run(() =>
            post(`/api/appointments/${appointmentId}`, 'PATCH', {
              // An empty string means UNASSIGN. The API turns '' into null;
              // omitting the key entirely would mean "leave it alone", which
              // is a different intent.
              employeeId: e.target.value,
            })
          )
        }
      >
        <option value="">Unassigned</option>
        {technicians.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </>
  );

  // ── List row: the short form ──────────────────────────────────────────────
  if (!full) {
    return (
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {notice && <Alert tone="positive">{notice}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          {canInvoice && (
            <button type="button" disabled={busy} className={buttonClass('primary', 'sm')} onClick={completeAndInvoice}>
              {status === 'completed' ? 'Send invoice' : 'Complete & send invoice'}
            </button>
          )}
          {invoiceBadge}
          {assign}
          {!closed && (
            <button type="button" disabled={busy} className={buttonClass('danger', 'sm')} onClick={cancelBooking}>
              Cancel booking
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Detail screen: full-width rows ────────────────────────────────────────
  const completeCols = [canInvoice || invoiceBadge, canClose].filter(Boolean).length;
  const statusButtons = [
    status !== 'confirmed' && !closed,
    !closed,
    !closed,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="positive">{notice}</Alert>}

      {/* Row 1: complete */}
      {completeCols > 0 && (
        <div className={`grid gap-2 ${completeCols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {canInvoice ? (
            <button
              type="button"
              disabled={busy}
              className={buttonClass('primary', 'sm', 'w-full px-2')}
              onClick={completeAndInvoice}
            >
              {status === 'completed' ? 'Send invoice' : 'Complete & send invoice'}
            </button>
          ) : (
            invoiceBadge
          )}
          {canClose && (
            <button
              type="button"
              disabled={busy}
              aria-expanded={closing}
              className={buttonClass(closing ? 'secondary' : 'primary', 'sm', 'w-full px-2')}
              onClick={() => setClosing((v) => !v)}
            >
              {status === 'completed' ? 'Record payment' : 'Complete & close'}
            </button>
          )}
        </div>
      )}

      {closing && canClose && (
        <div className="space-y-2.5 rounded-sm border border-white/10 bg-white/[0.02] p-3">
          <label
            htmlFor={`paid-${appointmentId}`}
            className="font-mono text-[11px] uppercase tracking-widest2 text-subtle"
          >
            Payment
          </label>
          <select
            id={`paid-${appointmentId}`}
            className="input-field"
            value={payment}
            disabled={busy}
            onChange={(e) => setPayment(e.target.value as PaymentChoice)}
          >
            {PAYMENT_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-[12px] leading-snug text-subtle">
            {payment === 'none'
              ? status === 'completed'
                ? 'Nothing is recorded. Pick how they paid to close it out.'
                : 'Marks the job done and awards points. Nothing is recorded as paid; send or record it later.'
              : `Marks the job done${status === 'completed' ? '' : ', awards points'} and records the balance as paid. No invoice is emailed.`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || (status === 'completed' && payment === 'none')}
              className={buttonClass('primary', 'sm', 'w-full')}
              onClick={completeAndClose}
            >
              {busy ? 'Saving…' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClass('ghost', 'sm', 'w-full')}
              onClick={() => setClosing(false)}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Row 2: assign */}
      <div>{assign}</div>

      {!closed && (
        <>
          {/* Row 3: reschedule — label above, then ONE row: the input takes
              what is left and the button stretches to the input's height, so
              on a phone the two never wrap onto each other. */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`when-${appointmentId}`}
              className="font-mono text-[11px] uppercase tracking-widest2 text-subtle"
            >
              Move to
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id={`when-${appointmentId}`}
                type="datetime-local"
                className="input-field min-w-0 flex-1"
                value={when}
                disabled={busy}
                onChange={(e) => setWhen(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !when}
                className={buttonClass('secondary', 'md', 'shrink-0 self-stretch')}
                onClick={() =>
                  run(() =>
                    // The value is a LOCAL wall-clock string with no zone. It is
                    // converted here by the browser, whose timezone is assumed to
                    // be the shop's — the same assumption the availability
                    // calendar makes. A remote manager in another zone would need
                    // an explicit zone picker; noted as a gap rather than papered
                    // over with a guess.
                    post(`/api/appointments/${appointmentId}`, 'PATCH', {
                      startsAt: new Date(when).toISOString(),
                    })
                  )
                }
              >
                Reschedule
              </button>
            </div>
          </div>

          {/* Row 4: status */}
          <div className={`grid gap-2 ${statusButtons === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {status !== 'confirmed' && (
              <button
                type="button"
                disabled={busy}
                className={buttonClass('secondary', 'sm', 'w-full px-2')}
                onClick={() =>
                  run(() => post(`/api/appointments/${appointmentId}`, 'PATCH', { status: 'confirmed' }))
                }
              >
                Confirmed
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              className={buttonClass('danger', 'sm', 'w-full px-2')}
              onClick={cancelBooking}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClass('secondary', 'sm', 'w-full px-2')}
              onClick={() =>
                run(() => post(`/api/appointments/${appointmentId}`, 'PATCH', { status: 'no_show' }))
              }
            >
              No show
            </button>
          </div>
        </>
      )}
    </div>
  );
}

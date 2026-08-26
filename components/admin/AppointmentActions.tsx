'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Assign / reschedule / cancel, for one appointment.
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

export default function AppointmentActions({
  appointmentId,
  employeeId,
  status,
  technicians,
  /** The detail screen shows reschedule and status controls; a list row does not. */
  full = false,
  startsAtLocalValue,
}: {
  appointmentId: string;
  employeeId: string | null;
  status: AppointmentStatus;
  technicians: TechnicianOption[];
  full?: boolean;
  /** 'YYYY-MM-DDTHH:mm' in the business timezone, for the datetime-local input. */
  startsAtLocalValue?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [when, setWhen] = useState(startsAtLocalValue ?? '');

  const closed = status === 'cancelled' || status === 'completed';

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError('');
    const result = await fn().catch(() => ({ ok: false, error: 'No connection.' }));
    if (!result.ok) setError(result.error ?? 'That did not work.');
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`tech-${appointmentId}`}>
          Assign technician
        </label>
        <select
          id={`tech-${appointmentId}`}
          className="input-field max-w-[14rem]"
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

        {!closed && (
          <button
            type="button"
            disabled={busy}
            className={buttonClass('danger', 'sm')}
            onClick={() => {
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
            }}
          >
            Cancel booking
          </button>
        )}
      </div>

      {full && !closed && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`when-${appointmentId}`}
                className="font-mono text-[11px] uppercase tracking-widest2 text-subtle"
              >
                Move to
              </label>
              <input
                id={`when-${appointmentId}`}
                type="datetime-local"
                className="input-field"
                value={when}
                disabled={busy}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={busy || !when}
              className={buttonClass('secondary', 'sm')}
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

          <div className="flex flex-wrap gap-2">
            {status !== 'confirmed' && (
              <button
                type="button"
                disabled={busy}
                className={buttonClass('secondary', 'sm')}
                onClick={() =>
                  run(() => post(`/api/appointments/${appointmentId}`, 'PATCH', { status: 'confirmed' }))
                }
              >
                Mark confirmed
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              className={buttonClass('secondary', 'sm')}
              onClick={() =>
                run(() => post(`/api/appointments/${appointmentId}`, 'PATCH', { status: 'no_show' }))
              }
            >
              No show
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClass('primary', 'sm')}
              onClick={() => {
                // Completing awards loyalty points and emails the customer, so
                // it gets a confirmation step. It is not reversible from the UI.
                if (!window.confirm('Complete this job? The customer is emailed and points are awarded.')) return;
                void run(() =>
                  post(`/api/appointments/${appointmentId}`, 'PATCH', { status: 'completed' })
                );
              }}
            >
              Complete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

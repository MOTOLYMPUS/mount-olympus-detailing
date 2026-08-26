'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Reschedule / cancel controls on a booking.
//
// The cancellation policy is enforced on the SERVER (lib/booking.ts), and the
// server's decision is final. This component reads the same window only to
// decide what to SHOW: offering a Cancel button that is guaranteed to fail is
// worse than explaining, up front, that the window has closed and giving the
// customer the phone number instead.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, buttonClass } from '@/components/ui';
import { business } from '@/lib/business';

interface Slot {
  startsAt: string;
  label: string;
  period: string;
  available: boolean;
}

interface DayResult {
  dateIso: string;
  openCount: number;
  slots: Slot[];
}

export default function ManageBooking({
  appointmentId,
  startsAt,
  status,
  canChange,
  noticeHours,
}: {
  appointmentId: string;
  startsAt: string;
  status: string;
  canChange: boolean;
  noticeHours: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'reschedule' | 'cancel'>('idle');
  const [days, setDays] = useState<DayResult[]>([]);
  const [dateIso, setDateIso] = useState('');
  const [choice, setChoice] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const closed = status === 'completed' || status === 'cancelled';

  async function openReschedule() {
    setMode('reschedule');
    setError('');
    try {
      // `ignore` excludes this booking from the conflict check — without it the
      // appointment would collide with its own current slot and every time
      // would look taken.
      const res = await fetch(`/api/availability?ignore=${appointmentId}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? 'We could not load available times.');
        return;
      }
      setDays(data.days ?? []);
      const firstOpen = (data.days as DayResult[]).find((d) => d.openCount > 0);
      if (firstOpen) setDateIso(firstOpen.dateIso);
    } catch {
      setError('You appear to be offline.');
    }
  }

  async function reschedule() {
    if (!choice) return;
    setPending(true);
    setError('');
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt: choice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'We could not move that booking.');
        return;
      }
      setMode('idle');
      router.refresh();
    } catch {
      setError('You appear to be offline.');
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    setPending(true);
    setError('');
    try {
      const res = await fetch(
        `/api/appointments/${appointmentId}?reason=${encodeURIComponent(reason || 'Cancelled by customer')}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'We could not cancel that booking.');
        return;
      }
      setMode('idle');
      router.refresh();
    } catch {
      setError('You appear to be offline.');
    } finally {
      setPending(false);
    }
  }

  if (closed) return null;

  if (!canChange) {
    return (
      <Alert tone="info" title="Too close to change online">
        Bookings can be moved or cancelled up to {noticeHours} hours beforehand. Yours is sooner
        than that — give us a call on{' '}
        <a href={business.phoneHref} className="underline">
          {business.phone}
        </a>{' '}
        and we will sort it out.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={openReschedule} className={buttonClass('secondary', 'sm')}>
            Reschedule
          </button>
          <button type="button" onClick={() => setMode('cancel')} className={buttonClass('danger', 'sm')}>
            Cancel booking
          </button>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="space-y-4">
          <p className="text-sm text-white">
            Currently {new Date(startsAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
          </p>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {days.map((d) => {
              const date = new Date(`${d.dateIso}T12:00:00Z`);
              const open = d.openCount > 0;
              return (
                <button
                  key={d.dateIso}
                  type="button"
                  disabled={!open}
                  onClick={() => {
                    setDateIso(d.dateIso);
                    setChoice('');
                  }}
                  aria-pressed={dateIso === d.dateIso}
                  className={`flex min-w-[60px] shrink-0 flex-col items-center rounded-sm border px-3 py-2 transition-colors ${
                    dateIso === d.dateIso
                      ? 'border-apex bg-apex/10'
                      : open
                        ? 'border-white/20 hover:border-white/50'
                        : 'cursor-not-allowed border-white/5 opacity-35'
                  }`}
                >
                  <span className="font-mono text-[10px] uppercase text-subtle">
                    {date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                  </span>
                  <span className="text-sm text-white">
                    {date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {days
              .find((d) => d.dateIso === dateIso)
              ?.slots.filter((s) => s.available)
              .map((s) => (
                <button
                  key={s.startsAt}
                  type="button"
                  onClick={() => setChoice(s.startsAt)}
                  aria-pressed={choice === s.startsAt}
                  className={`rounded-sm border px-3.5 py-1.5 font-mono text-[12px] transition-colors ${
                    choice === s.startsAt
                      ? 'border-apex bg-apex/10 text-white'
                      : 'border-white/20 text-muted hover:border-white/50 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={reschedule}
              disabled={!choice || pending}
              className={buttonClass('primary', 'sm')}
            >
              {pending ? 'Moving…' : 'Confirm new time'}
            </button>
            <button type="button" onClick={() => setMode('idle')} className={buttonClass('ghost', 'sm')}>
              Never mind
            </button>
          </div>
        </div>
      )}

      {mode === 'cancel' && (
        <div className="space-y-3" role="alertdialog" aria-label="Confirm cancellation">
          <p className="text-sm text-white">Cancel this booking?</p>
          <input
            className="input-field"
            placeholder="Reason (optional — it helps us improve)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            aria-label="Cancellation reason"
          />
          <div className="flex gap-3">
            <button type="button" onClick={cancel} disabled={pending} className={buttonClass('danger', 'sm')}>
              {pending ? 'Cancelling…' : 'Yes, cancel it'}
            </button>
            <button type="button" onClick={() => setMode('idle')} className={buttonClass('ghost', 'sm')}>
              Keep my booking
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

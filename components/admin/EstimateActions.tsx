'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions for one estimate request, plus the hand-off to booking.
//
// ⚠️ "CONVERT TO BOOKING" IS HONEST ABOUT WHAT IT DOES. It marks the estimate
// SCHEDULED and opens the booking flow with the quoted service preselected. It
// does NOT create the appointment, because an estimate request carries only a
// name, an email and a phone number — there may be no user account behind it,
// and inventing one silently would produce a customer record nobody can sign
// into and an appointment attached to a stranger.
//
// The real conversion is: find or create the customer, then book. Until a
// staff-side "book on behalf of" screen exists, that is a two-minute phone job,
// and the contact details are put next to the button so it can be done from
// here. Pretending otherwise would be worse than the extra step.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Alert, buttonClass } from '@/components/ui';

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'closed', label: 'Closed' },
] as const;

export default function EstimateActions({
  estimateId,
  status,
  bookingHref,
}: {
  estimateId: string;
  status: string;
  /** Prefilled /app/book URL — a hint to the booking flow, nothing more. */
  bookingHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function setStatus(next: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error ?? 'That did not save.');
      else router.refresh();
    } catch {
      setError('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            disabled={busy || s.value === status}
            aria-pressed={s.value === status}
            onClick={() => setStatus(s.value)}
            className={clsx(
              'rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest2 transition-colors disabled:cursor-default',
              s.value === status
                ? 'border-apex bg-apex/10 text-white'
                : 'border-white/20 text-muted hover:border-white/50 hover:text-white'
            )}
          >
            {s.label}
          </button>
        ))}

        <Link href={bookingHref} className={buttonClass('secondary', 'sm', 'ml-auto')}>
          Convert to booking
        </Link>
      </div>
    </div>
  );
}

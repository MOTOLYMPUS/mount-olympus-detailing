'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Remove / restore a vehicle in a customer's garage, from the owner's side.
//
// Same route the customer's own garage uses (DELETE archives, PATCH restore
// un-archives; managers+ may reach any vehicle). Archive, never delete — past
// bookings reference the row. Two-step inline confirmation, no native dialog.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from '@/components/ui';

export default function CustomerVehicleActions({
  id,
  label,
  archived,
}: {
  id: string;
  label: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function call(init: RequestInit) {
    setPending(true);
    setError('');
    try {
      const res = await fetch(`/api/vehicles/${id}`, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'That did not work.');
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError('No connection.');
    } finally {
      setPending(false);
    }
  }

  if (archived) {
    return (
      <span className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            call({
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'restore' }),
            })
          }
          className={buttonClass('secondary', 'sm')}
        >
          {pending ? 'Restoring…' : 'Restore'}
        </button>
        {error && <span className="text-[12px] text-flare">{error}</span>}
      </span>
    );
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={buttonClass('danger', 'sm')}>
        Remove
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label="Confirm removal">
      <span className="text-[12px] text-white">Remove the {label}?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => call({ method: 'DELETE' })}
        className={buttonClass('danger', 'sm')}
      >
        {pending ? 'Removing…' : 'Yes, remove'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={buttonClass('ghost', 'sm')}>
        Keep
      </button>
      {error && <span className="text-[12px] text-flare">{error}</span>}
    </span>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from '@/components/ui';

/**
 * Two-step confirmation rather than a `window.confirm()`.
 *
 * A native confirm is unstyled, unreadable on mobile, and blocked entirely in
 * some installed-PWA contexts. Inlining the confirmation also lets the button
 * name what is about to be removed, which is the part that actually prevents
 * the mistake.
 */
export default function ArchiveVehicleButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function archive() {
    setPending(true);
    setError('');
    try {
      const res = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('We could not remove that. Please try again.');
        return;
      }
      router.push('/app/garage');
      router.refresh();
    } catch {
      setError('You appear to be offline.');
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={buttonClass('danger', 'sm')}>
        Remove vehicle
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3" role="alertdialog" aria-label="Confirm removal">
      <p className="text-[13px] text-white">Remove the {label}?</p>
      <button type="button" onClick={archive} disabled={pending} className={buttonClass('danger', 'sm')}>
        {pending ? 'Removing…' : 'Yes, remove it'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={buttonClass('ghost', 'sm')}>
        Keep it
      </button>
      {error && (
        <p className="text-[12px] text-flare" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from '@/components/ui';

/**
 * Accept / decline on a quote.
 *
 * Accepting does NOT book anything — it records intent and sends the customer
 * into the booking flow with the quote's services pre-selected. Auto-creating
 * an appointment would mean choosing a time on the customer's behalf, and the
 * whole point of the availability engine is that they pick it.
 */
export default function EstimateActions({
  estimateId,
  status,
  bookHref,
}: {
  estimateId: string;
  status: string;
  bookHref: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');

  async function act(next: 'accepted' | 'declined') {
    setPending(next);
    setError('');
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'We could not update that quote.');
        return;
      }
      if (next === 'accepted') {
        router.push(bookHref);
      } else {
        router.refresh();
      }
    } catch {
      setError('You appear to be offline.');
    } finally {
      setPending('');
    }
  }

  if (status === 'declined') {
    return <p className="text-[13px] text-subtle">You declined this quote.</p>;
  }

  if (status === 'accepted' || status === 'scheduled') {
    return (
      <a href={bookHref} className={buttonClass('primary', 'sm')}>
        {status === 'scheduled' ? 'View booking' : 'Book this in'}
      </a>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => act('accepted')}
        disabled={!!pending}
        className={buttonClass('primary', 'sm')}
      >
        {pending === 'accepted' ? 'Accepting…' : 'Accept & book'}
      </button>
      <button
        type="button"
        onClick={() => act('declined')}
        disabled={!!pending}
        className={buttonClass('ghost', 'sm')}
      >
        {pending === 'declined' ? 'Declining…' : 'Decline'}
      </button>
      {error && (
        <p className="text-[12px] text-flare" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

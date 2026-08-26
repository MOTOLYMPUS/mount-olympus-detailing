'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Post-job rating.
//
// The stars are radio inputs, not clickable spans. That is what makes the
// control reachable by keyboard and announced correctly by a screen reader —
// a div with an onClick is the single most common accessibility failure in a
// star rating, and it is entirely avoidable.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, buttonClass } from '@/components/ui';

export default function RateJob({
  appointmentId,
  jobId,
  currentRating,
  currentFeedback,
}: {
  appointmentId: string;
  jobId: string;
  currentRating: number | null;
  currentFeedback: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(currentRating ?? 0);
  const [feedback, setFeedback] = useState(currentFeedback ?? '');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return;
    setPending(true);
    setError('');

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerRating: rating, customerFeedback: feedback }),
      });
      if (!res.ok) {
        setError('We could not save that. Please try again.');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('You appear to be offline.');
    } finally {
      setPending(false);
    }
  }

  if (saved || (currentRating && !pending && rating === currentRating && feedback === currentFeedback)) {
    return (
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
          Your rating
        </p>
        <p className="text-lg text-flare" aria-label={`${rating} out of 5`}>
          {'★'.repeat(rating)}
          <span className="text-white/20">{'★'.repeat(5 - rating)}</span>
        </p>
        {feedback && <p className="mt-2 text-[13px] text-muted">{feedback}</p>}
        <button
          type="button"
          onClick={() => setSaved(false)}
          className="mt-2 text-[12px] text-subtle underline-offset-4 hover:text-white hover:underline"
        >
          Change it
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <fieldset>
        <legend className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
          How did we do?
        </legend>

        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="cursor-pointer text-2xl leading-none transition-transform hover:scale-110"
            >
              {/* sr-only rather than display:none — a hidden input is not
                  focusable, which would defeat the point of using radios. */}
              <input
                type="radio"
                name={`rating-${appointmentId}`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={n <= rating ? 'text-flare' : 'text-white/20 hover:text-white/40'}
              >
                ★
              </span>
              <span className="sr-only">{n} star{n === 1 ? '' : 's'}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <textarea
        className="input-field mt-3 resize-y"
        rows={2}
        maxLength={1000}
        placeholder="Anything you would like us to know? (optional)"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        aria-label="Feedback"
      />

      <button type="submit" disabled={!rating || pending} className={buttonClass('secondary', 'sm', 'mt-3')}>
        {pending ? 'Saving…' : 'Submit rating'}
      </button>
    </form>
  );
}

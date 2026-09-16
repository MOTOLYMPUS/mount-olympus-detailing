'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Post-job review: 1–5 stars, a short description, and up to six photos.
//
// Shown only once the job is completed AND paid — the page decides that; this
// component just renders and submits. Photos go through /api/uploads (scope
// 'reviews'), which sniffs the bytes and names the files, then the review is
// written in one request with the resulting URLs.
//
// The stars are radio inputs, not clickable spans, so the control is keyboard
// reachable and announced correctly by a screen reader.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Alert, buttonClass } from '@/components/ui';
import type { Review } from '@/lib/models';

const MAX_PHOTOS = 6;
const ACCEPT = 'image/jpeg,image/png,image/webp';

function Stars({ value }: { value: number }) {
  return (
    <p className="text-lg text-flare" aria-label={`${value} out of 5`}>
      {'★'.repeat(value)}
      <span className="text-white/20">{'★'.repeat(5 - value)}</span>
    </p>
  );
}

export default function ReviewJob({ appointmentId, review }: { appointmentId: string; review: Review | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(!review);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [photos, setPhotos] = useState<string[]>(review?.photoUrls ?? []);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.set('scope', 'reviews');
      files.forEach((f) => form.append('file', f));
      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'That upload failed.');
      setPhotos((p) => [...p, ...(data.files as { url: string }[]).map((f) => f.url)].slice(0, MAX_PHOTOS));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return;
    setPending(true);
    setError('');
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment, photoUrls: photos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'We could not save that. Please try again.');
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'You appear to be offline.');
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">Your review</p>
        <Stars value={rating} />
        {comment && <p className="mt-2 text-[13px] leading-relaxed text-muted">{comment}</p>}
        {photos.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {photos.map((url) => (
              <li key={url} className="overflow-hidden rounded-sm border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[13px] text-muted">Thank you — this helps us and the next customer.</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
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
            <label key={n} className="cursor-pointer text-3xl leading-none transition-transform hover:scale-110">
              <input
                type="radio"
                name={`rating-${appointmentId}`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
              />
              <span aria-hidden="true" className={n <= rating ? 'text-flare' : 'text-white/20 hover:text-white/40'}>
                ★
              </span>
              <span className="sr-only">
                {n} star{n === 1 ? '' : 's'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <textarea
        className="input-field mt-3 resize-y"
        rows={3}
        maxLength={2000}
        placeholder="Tell us about the result — a sentence or two is perfect."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        aria-label="Your review"
      />

      <div className="mt-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={onPick}
          aria-label="Add photos to your review"
        />
        {photos.length > 0 && (
          <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {photos.map((url) => (
              <li key={url} className="relative overflow-hidden rounded-sm border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                  className="absolute right-1 top-1 rounded-full bg-obsidian/80 px-1.5 font-mono text-[10px] text-white"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={buttonClass('secondary', 'sm')}
          >
            {uploading ? 'Uploading…' : photos.length ? 'Add more photos' : 'Add photos'}
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={!rating || pending || uploading} className={buttonClass('primary', 'sm')}>
          {pending ? 'Saving…' : review ? 'Save changes' : 'Submit review'}
        </button>
        {review && (
          <button type="button" onClick={() => setEditing(false)} className={buttonClass('ghost', 'sm')}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

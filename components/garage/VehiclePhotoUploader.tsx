'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Add / change / remove the photo on a vehicle.
//
// Pick → crop → upload → save:
//   1. the customer picks a picture (file input; the phone's own picker);
//   2. <PhotoCropper> frames it to the band's 2:1 shape and re-encodes it as
//      a ~1600 px JPEG — which also sidesteps the size cap and HEIC;
//   3. POST /api/uploads owns the bytes (sniffing, safe filenames — see
//      lib/uploads.ts);
//   4. PATCH /api/vehicles/:id records the URL on the vehicle. The server
//      deletes the previous file when a photo is replaced or removed.
//
// Renders the photo through <VehiclePhotoHeader> so the band looks identical
// here and on every read-only surface. With no photo it draws an "Add a
// photo" band of the same height, so cards do not jump when one is added.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import clsx from 'clsx';
import PhotoCropper from './PhotoCropper';
import { VehiclePhotoHeader } from './VehiclePhoto';

/**
 * No HEIC here on purpose. When the accept list omits it, iOS converts HEIC
 * photos to JPEG before handing them over; when it is listed, iOS sends the
 * HEIC as-is and Android/desktop browsers cannot display it. (The cropper
 * re-encodes to JPEG anyway, so this is belt and braces.)
 */
const ACCEPT = 'image/jpeg,image/png,image/webp';

/** The band is 2:1 — the shape of the garage card header on a phone. */
export const VEHICLE_PHOTO_ASPECT = 2;

export default function VehiclePhotoUploader({
  vehicleId,
  photoUrl,
  alt,
  className,
  height,
}: {
  vehicleId: string;
  photoUrl: string | null;
  alt: string;
  className?: string;
  height?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<string | null>(photoUrl);
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function setPhoto(url: string | null) {
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setPhoto', photoUrl: url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not save the photo.');
    setCurrent(url);
    // Every other page that shows this vehicle is server-rendered; refresh so
    // they pick up the new photo on the next paint rather than on next visit.
    router.refresh();
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPicked(file);
  }

  async function onCropped(blob: Blob) {
    setPicked(null);
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('scope', 'vehicles');
      form.append('file', blob, 'vehicle.jpg');
      const up = await fetch('/api/uploads', { method: 'POST', body: form });
      const data = await up.json().catch(() => ({}));
      if (!up.ok || !data.ok) throw new Error(data.error ?? 'That upload failed.');
      await setPhoto(data.files[0].url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError('');
    try {
      await setPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  }

  const pill =
    'rounded-sm border border-white/20 bg-obsidian/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest2 text-white backdrop-blur-sm transition-colors hover:border-white/50 disabled:opacity-50';

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={onPick}
        aria-label={`Choose a photo for ${alt}`}
      />

      {current ? (
        <VehiclePhotoHeader src={current} alt={alt} height={height}>
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={pill}>
            {busy ? 'Saving…' : 'Change'}
          </button>
          <button type="button" disabled={busy} onClick={onRemove} className={pill}>
            Remove
          </button>
        </VehiclePhotoHeader>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'flex w-full flex-col items-center justify-center gap-1.5 border-b border-dashed border-white/15 bg-white/[0.02] text-muted transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50',
            height ?? 'h-40'
          )}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          <span className="font-mono text-[11px] uppercase tracking-widest2">
            {busy ? 'Uploading…' : 'Add a photo'}
          </span>
        </button>
      )}

      {error && (
        <p className="px-1 pt-2 text-[12px] text-flare" role="alert">
          {error}
        </p>
      )}

      {picked && (
        <PhotoCropper
          file={picked}
          aspect={VEHICLE_PHOTO_ASPECT}
          onCancel={() => setPicked(null)}
          onDone={onCropped}
        />
      )}
    </div>
  );
}

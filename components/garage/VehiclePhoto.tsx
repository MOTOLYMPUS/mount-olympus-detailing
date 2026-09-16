// ─────────────────────────────────────────────────────────────────────────────
// The vehicle photo, drawn the same way everywhere it appears.
//
// Three shapes:
//   <VehiclePhotoHeader>    the band across the top of a card. Clear at the
//                           top; the bottom ~30% dissolves into the card so
//                           the description below reads as part of the same
//                           surface, with no edge between them.
//   <VehiclePhotoBackdrop>  the same photo and the same fade, but faint and
//                           behind a whole card (home dashboard, bookings
//                           list) — context, not the subject.
//   <VehicleThumb>          a small square for dense admin lists.
//
// THE FADE IS A MASK ON THE IMAGE (`.photo-fade` in globals.css), not a dark
// gradient painted over it. A painted gradient ends in a solid colour, and no
// solid colour matches a translucent card on a textured page — that is what
// produced the hard line between photo and description. A mask makes the
// pixels themselves transparent, so the card shows through and there is
// nothing to draw a line against.
//
// Plain <img>, not next/image: these are customer uploads served from
// /api/files, which next/image cannot optimise without a custom loader, and
// they are already phone-sized (the cropper re-encodes at ~1600 px).
//
// No 'use client' — pure markup, usable from server pages and client
// components alike.
// ─────────────────────────────────────────────────────────────────────────────

import clsx from 'clsx';

/**
 * The shape every vehicle photo is cropped to and shown at: 7:4. Taller than
 * the old 2:1 band so that after the bottom third dissolves there is still a
 * clear view of the vehicle. Keep this, `VEHICLE_PHOTO_ASPECT` in the
 * uploader, and the cropper's frame in agreement.
 */
export const VEHICLE_PHOTO_ASPECT_CLASS = 'aspect-[7/4] h-auto';

export function VehiclePhotoHeader({
  src,
  alt,
  className,
  height = VEHICLE_PHOTO_ASPECT_CLASS,
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Tailwind sizing classes — defaults to the 7:4 band; choice cards pass a fixed height. */
  height?: string;
  /** Overlaid on the bottom-right (uploader controls). */
  children?: React.ReactNode;
}) {
  return (
    <div className={clsx('relative w-full overflow-hidden', height, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="photo-fade h-full w-full object-cover object-center"
      />
      {children && <div className="absolute bottom-2 right-2 flex gap-1.5">{children}</div>}
    </div>
  );
}

/**
 * The parent must be `relative isolate overflow-hidden`: `isolate` opens a
 * stacking context so this element's negative z-index sits behind the card's
 * ordinary content but not behind the page, and `overflow-hidden` clips it
 * to the card's rounded corners.
 */
export function VehiclePhotoBackdrop({ src, className }: { src: string | null | undefined; className?: string }) {
  if (!src) return null;
  return (
    <div className={clsx('pointer-events-none absolute inset-0 -z-10', className)} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        className="photo-fade h-full w-full object-cover object-center opacity-[0.18]"
      />
    </div>
  );
}

export function VehicleThumb({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={clsx(
        'h-11 w-11 shrink-0 rounded-sm border border-white/10 object-cover',
        className
      )}
    />
  );
}

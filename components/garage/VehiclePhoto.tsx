// ─────────────────────────────────────────────────────────────────────────────
// The vehicle photo, drawn the same way everywhere it appears.
//
// Two shapes:
//   <VehiclePhotoHeader>  the band across the top of a card. The image is
//                         clear at the top and fades into the card's own
//                         background towards the bottom, so whatever text
//                         sits under it stays legible without a hard edge.
//   <VehicleThumb>        a small square for dense lists (dashboard garage
//                         panel, admin customer page).
//
// Plain <img>, not next/image: these are customer uploads served from
// /api/files, which next/image cannot optimise without a custom loader, and
// they are already phone-sized.
//
// No 'use client' — both are pure markup, usable from server pages and from
// client components alike.
// ─────────────────────────────────────────────────────────────────────────────

import clsx from 'clsx';

/**
 * Gradient that turns a photo into a card header. Fades to obsidian, which
 * is the page ground the translucent cards sit on, so the bottom edge of the
 * photo dissolves into the card instead of ending in a line.
 */
export const PHOTO_FADE =
  'pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-obsidian/40 to-obsidian';

export function VehiclePhotoHeader({
  src,
  alt,
  className,
  height = 'h-40',
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Tailwind height class — cards use h-40, choice cards h-28. */
  height?: string;
  /** Overlaid on the bottom-right (uploader controls). */
  children?: React.ReactNode;
}) {
  return (
    <div className={clsx('relative w-full overflow-hidden', height, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover object-center" />
      <div className={PHOTO_FADE} aria-hidden="true" />
      {children && <div className="absolute bottom-2 right-2 flex gap-1.5">{children}</div>}
    </div>
  );
}

/**
 * The photo as a faint backdrop behind a whole card, for surfaces where the
 * vehicle is context rather than the subject (the home dashboard, the
 * bookings list). Same fade as the header so the family resemblance holds,
 * but at low opacity so it never competes with the text on top of it.
 *
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
      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover object-center opacity-[0.18]" />
      <div className={PHOTO_FADE} />
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

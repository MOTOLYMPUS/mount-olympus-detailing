// ─────────────────────────────────────────────────────────────────────────────
// Loading skeletons.
//
// A server component — a skeleton needs no interactivity, and shipping one as
// a client component would add JavaScript to the very moment the page is
// trying to feel fast.
//
// THE RULE THAT MAKES SKELETONS WORTH HAVING: a skeleton must occupy the SAME
// space as the content that replaces it. A skeleton of the wrong height is
// worse than a spinner, because it causes the layout shift it was supposed to
// prevent. Each variant below is sized to its real counterpart in
// components/ui/index.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden="true" />;
}

/** Matches <Card> — same border, padding and radius. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={clsx('rounded-sm border border-white/10 bg-charcoal/40 p-5', className)}
      aria-hidden="true"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-6 w-2/3" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          // Varying widths — a stack of identical bars reads as a broken table
          // rather than as prose.
          <Skeleton key={i} className={clsx('h-3', i === lines - 1 ? 'w-1/2' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}

/** Matches <StatTile>. */
export function SkeletonTile() {
  return (
    <div className="rounded-sm border border-white/10 bg-charcoal/40 p-4" aria-hidden="true">
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="mt-3 h-7 w-24" />
      <Skeleton className="mt-2 h-2.5 w-16" />
    </div>
  );
}

export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTile key={i} />
      ))}
    </div>
  );
}

/** Matches the appointment/estimate row lists. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-white/5 rounded-sm border border-white/10" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="mt-2 h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Matches the photo grids. `aspect-square` is what actually reserves the box —
 * without an aspect ratio the grid collapses to zero height and every image
 * load shifts the page.
 */
export function SkeletonGallery({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full" />
      ))}
    </div>
  );
}

/**
 * Wraps a Suspense fallback with the announcement a purely visual skeleton
 * cannot make. Screen readers get "Loading"; sighted users get the shimmer.
 */
export function LoadingRegion({
  label = 'Loading',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

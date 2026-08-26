// ─────────────────────────────────────────────────────────────────────────────
// Pieces shared by the route-level `loading.tsx` files.
//
// Next renders a route's loading.tsx INSTANTLY while the server component above
// it is still fetching, which is the single largest contributor to how fast
// this app feels — the alternative is a blank frame for the whole duration of
// the query. That only pays off if the skeleton occupies the same space as the
// real thing; a skeleton of the wrong shape trades a blank frame for a layout
// shift, which is worse.
//
// So everything here is measured against its real counterpart:
//   • SkeletonPageHeader   → <PageHeader> in components/ui/index.tsx
//   • SkeletonPills        → the period / status filter navs
//   • SkeletonStatRow      → a <StatTile> grid at an arbitrary column count
//   • SkeletonTable        → the admin tables
//
// A server component, like components/visual/Skeleton.tsx: a skeleton needs no
// interactivity, and shipping JavaScript to the moment the page is trying to
// feel fast is self-defeating.
// ─────────────────────────────────────────────────────────────────────────────

import clsx from 'clsx';
import { Skeleton } from '@/components/visual/Skeleton';

/**
 * Mirrors <PageHeader>: `mb-8`, the eyebrow/title/description stack on the
 * left, an optional action button on the right, all baseline-aligned.
 */
export function SkeletonPageHeader({
  description = true,
  action = false,
}: {
  description?: boolean;
  action?: boolean;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4" aria-hidden="true">
      <div className="min-w-0">
        <Skeleton className="mb-2 h-3 w-28" />
        {/* h-8 ≈ the 2xl/3xl display heading's rendered height. */}
        <Skeleton className="h-8 w-64 max-w-full" />
        {description && <Skeleton className="mt-3 h-3.5 w-[28rem] max-w-full" />}
      </div>
      {/* Same box as a `md` button: px-5 py-2.5 text-sm ≈ 40px tall. */}
      {action && <Skeleton className="h-10 w-36" />}
    </header>
  );
}

/** Mirrors the rounded-full filter/period navs on /admin and /staff/jobs. */
export function SkeletonPills({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx('mb-6 flex flex-wrap gap-2', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[30px] w-20 rounded-full" />
      ))}
    </div>
  );
}

/**
 * A <StatTile> grid. `cols` has to match the real page's grid exactly —
 * three tiles laid out in four columns is precisely the mismatch that produces
 * the shift this file exists to prevent.
 */
export function SkeletonStatRow({
  count = 4,
  cols = 4,
  className,
}: {
  count?: number;
  cols?: 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'grid grid-cols-2 gap-3',
        cols === 3 ? 'sm:grid-cols-3' : 'lg:grid-cols-4',
        className
      )}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-sm border border-white/10 bg-charcoal/40 p-4">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the `<Card>` shell so a card-wrapped list keeps its border and padding. */
export function SkeletonPanel({
  title = true,
  children,
  className,
}: {
  title?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx('rounded-sm border border-white/10 bg-charcoal/40 p-5 shadow-card', className)}
      aria-hidden="true"
    >
      {/* Matches <CardTitle>: mb-4, an 11px mono label. */}
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-2.5 w-32" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      )}
      {children}
    </div>
  );
}

/** Mirrors the admin tables — a header rule plus evenly spaced rows. */
export function SkeletonTable({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto" aria-hidden="true">
      <div className="min-w-[38rem]">
        <div className="flex gap-3 border-b border-white/10 py-2">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className={clsx('h-2.5', i === 0 ? 'w-32' : 'flex-1')} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3 border-b border-white/5 py-3 last:border-0">
            {Array.from({ length: cols }).map((_, i) => (
              <Skeleton key={i} className={clsx('h-3.5', i === 0 ? 'w-32' : 'flex-1')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors <JobCard> — used by every staff list. */
export function SkeletonJobCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-sm border border-white/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
              <Skeleton className="mt-2 h-2.5 w-40" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

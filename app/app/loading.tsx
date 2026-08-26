// Mirrors app/app/page.tsx (customer dashboard): greeting header with a "Book
// a service" action, a two-up row of upcoming-appointment cards, then the
// loyalty/garage pair and the quotes/invoices pair — the four cards that are
// on screen for every customer regardless of how much history they have.

import { LoadingRegion } from '@/components/visual/Skeleton';
import { SkeletonPanel } from '@/components/app/LoadingParts';
import { Skeleton, SkeletonCard } from '@/components/visual/Skeleton';

export default function Loading() {
  return (
    <LoadingRegion label="Loading your dashboard">
      <div className="space-y-8">
        {/* The dashboard header is bespoke (eyebrow + greeting + button), not a
            <PageHeader>, so it is matched here rather than reused. */}
        <header className="flex flex-wrap items-end justify-between gap-4" aria-hidden="true">
          <div>
            <Skeleton className="mb-2 h-3 w-24" />
            <Skeleton className="h-8 w-72 max-w-full" />
          </div>
          <Skeleton className="h-10 w-40" />
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonPanel>
            <Skeleton className="h-9 w-40" />
            <Skeleton className="mt-4 h-2.5 w-full" />
            <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
          </SkeletonPanel>
          <SkeletonPanel>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </SkeletonPanel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonPanel>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-44" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              ))}
            </div>
          </SkeletonPanel>
          <SkeletonPanel>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              ))}
            </div>
          </SkeletonPanel>
        </div>
      </div>
    </LoadingRegion>
  );
}

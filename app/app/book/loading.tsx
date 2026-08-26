// Mirrors app/app/book/page.tsx: PageHeader, then BookingFlow's two-column
// shell — the wizard on the left and the sticky estimate summary on the right
// at `lg:grid-cols-[1fr_320px]`. The 320px track is reproduced literally,
// because on a wide screen an unmatched summary column is the most visible
// shift on the whole screen.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import { SkeletonPageHeader, SkeletonPanel } from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading the booking form">
      <div>
        <SkeletonPageHeader />

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]" aria-hidden="true">
          <div>
            {/* The five step labels. */}
            <div className="mb-8 flex flex-wrap gap-x-4 gap-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-2.5 w-16" />
              ))}
            </div>

            <Skeleton className="h-6 w-56" />

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-sm border border-white/15 p-4">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="mt-2 h-2.5 w-24" />
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center justify-between gap-3">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>

          <aside>
            <SkeletonPanel title={false}>
              <Skeleton className="mb-4 h-3 w-28" />
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3.5 w-14" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-4">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-6 w-20" />
              </div>
            </SkeletonPanel>
          </aside>
        </div>
      </div>
    </LoadingRegion>
  );
}

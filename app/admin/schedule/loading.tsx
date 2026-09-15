// Mirrors app/admin/schedule/page.tsx: PageHeader with the Filter + Estimate
// queue actions, the bookings list card, then the month calendar card. The
// filter card is collapsed by default, so it has no skeleton.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import { SkeletonPageHeader, SkeletonPanel } from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading the schedule">
      <>
        <SkeletonPageHeader action />

        <SkeletonPanel className="mb-6">
          <div className="divide-y divide-white/5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-56 max-w-full" />
                  <Skeleton className="mt-2 h-2.5 w-40" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonPanel>

        <SkeletonPanel>
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-8 w-10" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-8 w-10" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full sm:aspect-auto sm:h-16" />
            ))}
          </div>
        </SkeletonPanel>
      </>
    </LoadingRegion>
  );
}

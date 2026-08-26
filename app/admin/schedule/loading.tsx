// Mirrors app/admin/schedule/page.tsx: PageHeader with an "Estimate queue"
// action, the five-control filter card (`lg:grid-cols-5`), then the bookings
// list card.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import { SkeletonPageHeader, SkeletonPanel } from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading the schedule">
      <>
        <SkeletonPageHeader action />

        <SkeletonPanel className="mb-6" title={false}>
          <Skeleton className="mb-4 h-2.5 w-16" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-2.5 w-20" />
                {/* h-[46px] is the rendered height of `.input-field`. */}
                <Skeleton className="h-[46px] w-full" />
              </div>
            ))}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
              <Skeleton className="h-[42px] w-24" />
            </div>
          </div>
        </SkeletonPanel>

        <SkeletonPanel>
          <div className="divide-y divide-white/5">
            {Array.from({ length: 6 }).map((_, i) => (
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
      </>
    </LoadingRegion>
  );
}

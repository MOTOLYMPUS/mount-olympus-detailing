// Mirrors app/app/garage/page.tsx: PageHeader with description and an "Add a
// vehicle" action, then the 1/2/3-column vehicle card grid. The column counts
// must match `sm:grid-cols-2 lg:grid-cols-3` exactly — a skeleton grid one
// column narrower than the real one reflows every card when the data lands.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import { SkeletonPageHeader } from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading your garage">
      <div>
        <SkeletonPageHeader action />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-sm border border-white/10 bg-charcoal/40 p-5 shadow-card"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="mt-2 h-2.5 w-28" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>

              <div className="flex-1 space-y-2">
                {Array.from({ length: 3 }).map((_, r) => (
                  <div key={r} className="flex justify-between gap-3">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>

              {/* Two half-width buttons, exactly as the real card renders. */}
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

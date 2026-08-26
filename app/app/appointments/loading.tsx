// Mirrors app/app/appointments/page.tsx: PageHeader with a "Book a service"
// action, an "Upcoming" section of full-width cards, then a "Past" section
// rendered as a bordered, divided row list.

import { LoadingRegion, Skeleton, SkeletonRows } from '@/components/visual/Skeleton';
import { SkeletonPageHeader } from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading your appointments">
      <div className="space-y-10">
        <SkeletonPageHeader description={false} action />

        <section aria-hidden="true">
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-white/10 bg-charcoal/40 p-5 shadow-card"
              >
                <div className="min-w-[220px] flex-1">
                  <Skeleton className="h-4 w-52" />
                  <Skeleton className="mt-2 h-3 w-72 max-w-full" />
                  <Skeleton className="mt-2 h-2.5 w-44" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-hidden="true">
          <Skeleton className="mb-3 h-3 w-16" />
          <SkeletonRows count={5} />
        </section>
      </div>
    </LoadingRegion>
  );
}

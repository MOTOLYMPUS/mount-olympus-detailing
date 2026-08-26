// Mirrors app/app/estimates/page.tsx: a `max-w-3xl` column — the constraint
// matters, since a full-width skeleton would snap in on load — a PageHeader
// with a "Book directly" action, then a vertical stack of quote cards.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import { SkeletonPageHeader, SkeletonPanel } from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading your quotes">
      <div className="max-w-3xl">
        <SkeletonPageHeader action />

        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonPanel key={i} title={false}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Skeleton className="h-4 w-52" />
                  <Skeleton className="mt-2 h-2.5 w-64 max-w-full" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>

              <Skeleton className="h-3 w-72 max-w-full" />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
                <div>
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="mt-2 h-2.5 w-24" />
                </div>
                <Skeleton className="h-8 w-32" />
              </div>
            </SkeletonPanel>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

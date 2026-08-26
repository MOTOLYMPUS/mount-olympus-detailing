// Mirrors app/app/rewards/page.tsx: PageHeader, a THREE-column stat row
// (`sm:grid-cols-3`, not the four-column default), then the progress, referral,
// membership and ledger cards.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import { SkeletonPageHeader, SkeletonPanel, SkeletonStatRow } from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading your rewards">
      <>
        <SkeletonPageHeader />

        <SkeletonStatRow count={3} cols={3} className="mb-6" />

        <SkeletonPanel className="mb-6" title={false}>
          <Skeleton className="mb-4 h-2.5 w-20" />
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-28" />
          </div>
          {/* h-2 matches the real progress bar exactly. */}
          <Skeleton className="h-2 w-full rounded-full" />
        </SkeletonPanel>

        <SkeletonPanel className="mb-6" title={false}>
          <Skeleton className="mb-4 h-2.5 w-32" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
          <Skeleton className="mt-4 h-10 w-52" />
        </SkeletonPanel>

        <SkeletonPanel className="mb-6" title={false}>
          <Skeleton className="mb-4 h-2.5 w-36" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </SkeletonPanel>

        <SkeletonPanel title={false}>
          <Skeleton className="mb-4 h-2.5 w-32" />
          <div className="divide-y divide-white/5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3.5 w-14" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </>
    </LoadingRegion>
  );
}

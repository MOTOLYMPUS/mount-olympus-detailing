// Mirrors app/app/payments/page.tsx: PageHeader, then three stacked cards —
// balance due, invoices, payment history — each `mb-6` apart.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import { SkeletonPageHeader, SkeletonPanel } from '@/components/app/LoadingParts';

function Rows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-white/5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-2.5 w-40" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <LoadingRegion label="Loading your payments">
      <>
        <SkeletonPageHeader />

        <SkeletonPanel className="mb-6" title={false}>
          <Skeleton className="mb-4 h-2.5 w-28" />
          {/* The balance is a 3xl display figure — the tallest thing on the
              page and the one worth reserving space for precisely. */}
          <Skeleton className="h-9 w-40" />
        </SkeletonPanel>

        <SkeletonPanel className="mb-6" title={false}>
          <Skeleton className="mb-4 h-2.5 w-20" />
          <Rows count={3} />
        </SkeletonPanel>

        <SkeletonPanel title={false}>
          <Skeleton className="mb-4 h-2.5 w-32" />
          <Rows count={4} />
        </SkeletonPanel>
      </>
    </LoadingRegion>
  );
}

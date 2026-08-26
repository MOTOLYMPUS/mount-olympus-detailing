// Mirrors app/admin/customers/page.tsx: PageHeader, a THREE-column totals row,
// the search card, then the results table.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import {
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonStatRow,
  SkeletonTable,
} from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading customers">
      <>
        <SkeletonPageHeader />
        <SkeletonStatRow count={3} cols={3} className="mb-6" />

        <SkeletonPanel className="mb-6" title={false}>
          {/* The search form: a labelled field that grows, plus a submit. */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-[46px] w-full" />
            </div>
            <Skeleton className="h-[42px] w-24" />
          </div>
        </SkeletonPanel>

        <SkeletonPanel>
          <SkeletonTable rows={6} cols={6} />
        </SkeletonPanel>
      </>
    </LoadingRegion>
  );
}

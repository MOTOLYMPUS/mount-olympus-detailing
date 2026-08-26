// Mirrors app/admin/page.tsx: PageHeader with two actions, the period pills,
// four stat rows, the daily revenue chart, the four breakdown cards, and the
// leaderboard table.
//
// This is the longest skeleton in the app and the one that earns its keep: the
// admin dashboard runs a dozen aggregate queries before it can render a single
// pixel, so without this the owner gets a blank frame every time they open it.

import { LoadingRegion, Skeleton } from '@/components/visual/Skeleton';
import {
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonPills,
  SkeletonStatRow,
  SkeletonTable,
} from '@/components/app/LoadingParts';

/** The horizontal <BarChart> — a label row over a 1.5px track, six times. */
function SkeletonBars() {
  return (
    <ul className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export default function Loading() {
  return (
    <LoadingRegion label="Loading the business dashboard">
      <>
        <SkeletonPageHeader action />
        <SkeletonPills count={6} />

        <SkeletonStatRow count={4} className="mb-6" />

        <SkeletonPanel className="mb-6">
          {/* h-32 is the exact height of <ColumnChart>. */}
          <Skeleton className="h-32 w-full" />
        </SkeletonPanel>

        <SkeletonStatRow count={4} className="mb-6" />
        <SkeletonStatRow count={4} className="mb-6" />
        <SkeletonStatRow count={4} className="mb-6" />

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonPanel key={i}>
              <SkeletonBars />
            </SkeletonPanel>
          ))}
        </div>

        <SkeletonPanel>
          <SkeletonTable rows={5} cols={6} />
        </SkeletonPanel>
      </>
    </LoadingRegion>
  );
}

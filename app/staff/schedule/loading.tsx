// Mirrors app/staff/schedule/page.tsx: PageHeader with an "All jobs" action,
// then one card per day in a `space-y-6` stack. Three days is the honest
// average height — the real page renders fourteen, but a fourteen-card
// skeleton would be a wall of shimmer well past the fold.

import { LoadingRegion } from '@/components/visual/Skeleton';
import { SkeletonJobCards, SkeletonPageHeader, SkeletonPanel } from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading your schedule">
      <>
        <SkeletonPageHeader action />
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonPanel key={i}>
              <SkeletonJobCards count={i === 0 ? 2 : 1} />
            </SkeletonPanel>
          ))}
        </div>
      </>
    </LoadingRegion>
  );
}

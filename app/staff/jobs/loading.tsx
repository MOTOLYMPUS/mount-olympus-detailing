// Mirrors app/staff/jobs/page.tsx: PageHeader with a "Today" action, the
// four-item status filter nav, then one card holding the job list.

import { LoadingRegion } from '@/components/visual/Skeleton';
import {
  SkeletonJobCards,
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonPills,
} from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading your jobs">
      <>
        <SkeletonPageHeader action />
        <SkeletonPills count={4} />
        <SkeletonPanel>
          <SkeletonJobCards count={3} />
        </SkeletonPanel>
      </>
    </LoadingRegion>
  );
}

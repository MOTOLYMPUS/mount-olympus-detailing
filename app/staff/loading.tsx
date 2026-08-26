// Mirrors app/staff/page.tsx: PageHeader with a "Next 14 days" action, a
// four-tile "today at a glance" row (`mb-8`), then a card of today's JobCards.
//
// Deliberately plain. This is a technician's first screen of the day, often on
// a phone in a driveway; the skeleton's job is to hold the layout still for a
// few hundred milliseconds, nothing else.

import { LoadingRegion } from '@/components/visual/Skeleton';
import {
  SkeletonJobCards,
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonStatRow,
} from '@/components/app/LoadingParts';

export default function Loading() {
  return (
    <LoadingRegion label="Loading today's work">
      <>
        <SkeletonPageHeader action />
        <SkeletonStatRow count={4} className="mb-8" />
        <SkeletonPanel>
          <SkeletonJobCards count={2} />
        </SkeletonPanel>
      </>
    </LoadingRegion>
  );
}

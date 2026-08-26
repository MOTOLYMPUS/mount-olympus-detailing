import { Suspense } from 'react';
import BookingFlow from '@/components/booking/BookingFlow';
import { requirePage } from '@/lib/guards';
import { listVehicles } from '@/lib/repo/vehicles';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Book a service' };

export default function BookPage({
  searchParams,
}: {
  searchParams: { vehicle?: string; service?: string };
}) {
  const user = requirePage('/app/book');
  const vehicles = listVehicles(user.id);

  // The vehicle and service ids arrive from a dashboard link, so they are
  // hints, not commands — BookingFlow only honours one that is actually in the
  // customer's own list, and the API re-validates ownership regardless.
  const preselected = vehicles.some((v) => v.id === searchParams.vehicle)
    ? searchParams.vehicle
    : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="New booking"
        title="Book a service"
        description="Only genuinely free times are shown — travel, buffer and existing jobs are already taken into account."
      />

      <Suspense fallback={<div className="h-96" />}>
        <BookingFlow
          vehicles={vehicles}
          defaultAddress={user.address}
          preselectedVehicleId={preselected}
          preselectedServiceId={searchParams.service}
        />
      </Suspense>
    </div>
  );
}

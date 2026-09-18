// ─────────────────────────────────────────────────────────────────────────────
// /admin/customers/:id/book — book on a customer's behalf.
//
// For the phone or text booking: the owner walks the SAME wizard the customer
// would (their garage, real availability, real pricing with their coupons),
// but the booking is written to the customer's account and lands on the admin
// appointment page. The API accepts `customerId` from managers+ only.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import BookingFlow from '@/components/booking/BookingFlow';
import { LinkButton } from '@/components/ui';
import { requireRolePage } from '@/lib/guards';
import { getUser } from '@/lib/repo/users';
import { listVehicles } from '@/lib/repo/vehicles';

export const dynamic = 'force-dynamic';

export default async function AdminBookForCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vehicle?: string; service?: string }>;
}) {
  const { id } = await params;
  await requireRolePage('manager', `/admin/customers/${id}/book`);

  const customer = getUser(id);
  if (!customer || customer.role !== 'customer') notFound();

  const vehicles = listVehicles(customer.id);
  const sp = await searchParams;
  const preselected = vehicles.some((v) => v.id === sp.vehicle) ? sp.vehicle : undefined;

  return (
    <div>
      {/* Terse on purpose: the wizard below is laid out to fit a phone screen
          without scrolling, and a three-line description would eat that room.
          The customer still gets the confirmation email, text and push. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Book on their behalf</p>
          <h1 className="truncate font-display text-xl font-bold tracking-tightest text-white sm:text-2xl">
            {customer.name}
          </h1>
        </div>
        <LinkButton href={`/admin/customers/${customer.id}`} variant="ghost" size="sm">
          ← Back
        </LinkButton>
      </div>

      <Suspense fallback={<div className="h-96" />}>
        <BookingFlow
          vehicles={vehicles}
          defaultAddress={customer.address}
          preselectedVehicleId={preselected}
          preselectedServiceId={sp.service}
          customerId={customer.id}
          successHref="/admin/appointments/{id}"
          addVehicleHref={`/admin/customers/${customer.id}/vehicles/new`}
          compact
        />
      </Suspense>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /admin/customers/:id/vehicles/new — add a vehicle to a customer's garage.
//
// Needed for phone bookings: pricing is by vehicle, so a customer who has
// never used the app has nothing to book against until this is filled in.
// Same form the customer uses; POST /api/vehicles accepts `userId` from
// managers+ only.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import VehicleForm from '@/components/garage/VehicleForm';
import { LinkButton, PageHeader } from '@/components/ui';
import { requireRolePage } from '@/lib/guards';
import { getUser } from '@/lib/repo/users';

export const dynamic = 'force-dynamic';

export default async function AdminAddVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRolePage('manager', `/admin/customers/${id}/vehicles/new`);

  const customer = getUser(id);
  if (!customer || customer.role !== 'customer') notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Garage"
        title={`Add a vehicle for ${customer.name}`}
        description="It appears in their garage exactly as if they had added it, and you can book it straight away."
        action={
          <LinkButton href={`/admin/customers/${customer.id}`} variant="ghost" size="sm">
            ← {customer.name}
          </LinkButton>
        }
      />
      <VehicleForm forUserId={customer.id} successHref={`/admin/customers/${customer.id}/book`} />
    </div>
  );
}

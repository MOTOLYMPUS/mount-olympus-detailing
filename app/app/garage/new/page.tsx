import VehicleForm from '@/components/garage/VehicleForm';
import { requirePage } from '@/lib/guards';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add a vehicle' };

export default function NewVehiclePage() {
  requirePage('/app/garage/new');

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Garage"
        title="Add a vehicle"
        description="Tell us what you have and we will price everything correctly from the start."
      />
      <VehicleForm />
    </div>
  );
}

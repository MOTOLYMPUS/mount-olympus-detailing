import { notFound } from 'next/navigation';
import VehicleForm from '@/components/garage/VehicleForm';
import ArchiveVehicleButton from '@/components/garage/ArchiveVehicleButton';
import VehiclePhotoUploader from '@/components/garage/VehiclePhotoUploader';
import { requirePage } from '@/lib/guards';
import { getVehicle } from '@/lib/repo/vehicles';
import { vehicleLabel } from '@/lib/models';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage(`/app/garage/${(await params).id}`);
  const vehicle = getVehicle((await params).id);

  // 404 rather than 403 for someone else's vehicle — a 403 would confirm the
  // id exists.
  if (!vehicle || vehicle.userId !== user.id) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Garage" title={vehicleLabel(vehicle)} />

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest2 text-subtle">Photo</h2>
        <VehiclePhotoUploader
          vehicleId={vehicle.id}
          photoUrl={vehicle.photoUrl}
          alt={vehicleLabel(vehicle)}
          className="overflow-hidden rounded-sm border border-white/10"
          height="h-56"
        />
      </section>

      <VehicleForm vehicle={vehicle} />

      <div className="mt-10 border-t border-white/10 pt-6">
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
          Remove this vehicle
        </h2>
        <p className="mb-4 max-w-xl text-[13px] leading-relaxed text-muted">
          It disappears from your garage, but the service history and photos stay on the
          appointments they belong to — so a car you have sold does not take its records with it.
        </p>
        <ArchiveVehicleButton id={vehicle.id} label={vehicleLabel(vehicle)} />
      </div>
    </div>
  );
}

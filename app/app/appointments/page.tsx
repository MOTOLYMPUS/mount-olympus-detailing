import Link from 'next/link';
import { requirePage } from '@/lib/guards';
import { listAppointments } from '@/lib/repo/appointments';
import { listVehicles } from '@/lib/repo/vehicles';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { VehiclePhotoBackdrop } from '@/components/garage/VehiclePhoto';
import { formatDateTime, relativeTime } from '@/lib/timezone';
import { formatPrice } from '@/lib/pricing';
import { getService } from '@/data/pricing';
import { Card, EmptyState, LinkButton, PageHeader, StatusBadge, buttonClass } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My bookings' };

export default async function AppointmentsPage() {
  const user = await requirePage('/app/appointments');
  const tz = getSchedulingConfig().timezone;

  const upcoming = listAppointments({
    customerId: user.id,
    direction: 'upcoming',
    statuses: ['scheduled', 'confirmed', 'in_progress'],
    limit: 50,
  });
  const past = listAppointments({ customerId: user.id, direction: 'past', limit: 50 });

  // Vehicle photos, keyed by id, for the faint backdrop on each upcoming
  // card. Archived vehicles included: a booking can outlive the garage entry.
  const photoFor = new Map(listVehicles(user.id, true).map((v) => [v.id, v.photoUrl]));

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Your bookings"
        title="Appointments"
        action={<LinkButton href="/app/book">Book a service</LinkButton>}
      />

      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="eyebrow mb-3">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing coming up"
            description="When you book, it will appear here with everything you need to manage it."
            action={<LinkButton href="/app/book">Book a service</LinkButton>}
          />
        ) : (
          <ul className="space-y-3">
            {upcoming.map((a) => (
              <Card
                as="li"
                key={a.id}
                className="relative isolate flex flex-wrap items-center justify-between gap-4 overflow-hidden"
              >
                {/* Faint vehicle photo behind the card — context, not focus. */}
                <VehiclePhotoBackdrop src={a.vehicleId ? photoFor.get(a.vehicleId) : null} />
                <div className="relative min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-display text-base font-semibold text-white">
                      {formatDateTime(a.startsAt, tz)}
                    </p>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-[13px] text-muted">
                    {a.serviceIds.map((id) => getService(id)?.name ?? id).join(', ')}
                    {a.vehicleLabel ? ` · ${a.vehicleLabel}` : ''}
                  </p>
                  <p className="mt-0.5 text-[12px] text-subtle">
                    {relativeTime(a.startsAt)} · ref {a.reference}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm text-white">
                    {formatPrice(a.quotedTotal, a.quotedTotalMax)}
                  </span>
                  <Link href={`/app/appointments/${a.id}`} className={buttonClass('secondary', 'sm')}>
                    Manage
                  </Link>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="past">
          <h2 id="past" className="eyebrow mb-3">
            Past
          </h2>
          <ul className="divide-y divide-white/5 rounded-sm border border-white/10">
            {past.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/app/appointments/${a.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {a.serviceIds.map((id) => getService(id)?.name ?? id).join(', ')}
                    </p>
                    <p className="text-[12px] text-subtle">
                      {formatDateTime(a.startsAt, tz)}
                      {a.vehicleLabel ? ` · ${a.vehicleLabel}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-[13px] text-muted">
                      {formatPrice(a.quotedTotal, a.quotedTotalMax)}
                    </span>
                    <StatusBadge status={a.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

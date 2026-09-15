import Link from 'next/link';
import { requirePage } from '@/lib/guards';
import { listVehicles } from '@/lib/repo/vehicles';
import { listAppointments } from '@/lib/repo/appointments';
import { vehicleLabel } from '@/lib/models';
import { sizeLabel } from '@/lib/industries';
import { formatDate } from '@/lib/timezone';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { Badge, Card, EmptyState, LinkButton, PageHeader, buttonClass } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My garage' };

export default async function GaragePage() {
  const user = await requirePage('/app/garage');
  const tz = getSchedulingConfig().timezone;

  const vehicles = listVehicles(user.id);
  const history = listAppointments({ customerId: user.id, statuses: ['completed'], limit: 200 });

  // One pass to count visits per vehicle, rather than a query per card.
  const visits = new Map<string, { count: number; last: string }>();
  for (const a of history) {
    if (!a.vehicleId) continue;
    const current = visits.get(a.vehicleId);
    if (!current || a.startsAt > current.last) {
      visits.set(a.vehicleId, { count: (current?.count ?? 0) + 1, last: a.startsAt });
    } else {
      current.count += 1;
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Your vehicles"
        title="Garage"
        description="Cars, trucks, bikes, boats, jet skis, aircraft — anything we detail. Saving one makes booking a two-tap job."
        action={<LinkButton href="/app/garage/new">Add a vehicle</LinkButton>}
      />

      {vehicles.length === 0 ? (
        <EmptyState
          title="Your garage is empty"
          description="Add a vehicle and we will remember its size, finish and history, so every future quote is accurate before we arrive."
          action={<LinkButton href="/app/garage/new">Add your first vehicle</LinkButton>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => {
            const stat = visits.get(v.id);
            return (
              // Depth on a card that leads somewhere: both buttons at the foot
              // navigate, so the elevation is honest. `sweep-hover` fires once
              // per hover with no idle animation, which is what keeps a grid of
              // twelve vehicles from being a light show.
              <Card as="li" key={v.id} className="lift sweep-hover flex flex-col">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-semibold text-white">
                      {vehicleLabel(v)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-subtle">
                      {sizeLabel(v.sizeClass)} · {v.industry}
                    </p>
                  </div>
                  {v.isDefault && <Badge tone="info">Default</Badge>}
                </div>

                <dl className="flex-1 space-y-1.5 text-[13px]">
                  {v.color && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Color</dt>
                      <dd className="text-white">{v.color}</dd>
                    </div>
                  )}
                  {v.plate && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Plate</dt>
                      <dd className="font-mono text-white">{v.plate}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-subtle">Visits</dt>
                    <dd className="text-white">{stat?.count ?? 0}</dd>
                  </div>
                  {stat && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-subtle">Last detail</dt>
                      <dd className="text-white">{formatDate(stat.last, tz)}</dd>
                    </div>
                  )}
                </dl>

                {v.notes && (
                  <p className="mt-3 border-t border-white/5 pt-3 text-[12px] leading-relaxed text-muted">
                    {v.notes}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/app/book?vehicle=${v.id}`}
                    className={buttonClass('primary', 'sm', 'flex-1')}
                  >
                    Book
                  </Link>
                  <Link
                    href={`/app/garage/${v.id}`}
                    className={buttonClass('secondary', 'sm', 'flex-1')}
                  >
                    Edit
                  </Link>
                </div>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /admin/mileage — the mileage log: per-vehicle totals, business-use %, the
// standard-mileage deduction, and every trip for the tax year.
//
// requireRolePage('admin'), like /admin/expenses: tax data. Year and vehicle
// filters are plain links (?year=&vehicle=) so a filtered view is bookmarkable.
// All totals come from lib/mileage.ts; the client components only list/edit.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { requireRolePage } from '@/lib/guards';
import { listBusinessVehicles, listTrips } from '@/lib/repo/mileage';
import { getSchedulingConfig, getTaxProfile } from '@/lib/repo/settings';
import { formatMiles, vehicleYearSummaries } from '@/lib/mileage';
import { formatMoney } from '@/lib/pricing';
import { todayIso } from '@/lib/timezone';
import { Alert, Card, LinkButton, PageHeader, StatTile } from '@/components/ui';
import TripLog from '@/components/admin/TripLog';
import BusinessVehicleManager from '@/components/admin/BusinessVehicleManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mileage',
  robots: { index: false, follow: false },
};

const chip = (active: boolean) =>
  clsx(
    'rounded-sm border px-3.5 py-1.5 font-mono text-[12px] transition-colors',
    active ? 'border-apex bg-apex/10 text-white' : 'border-white/15 text-muted hover:border-white/40 hover:text-white'
  );

export default async function MileagePage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string; vehicle?: string }>;
}) {
  await requireRolePage('admin', '/admin/mileage');

  const sp = (await searchParams) ?? {};
  const thisYear = Number(todayIso(getSchedulingConfig().timezone).slice(0, 4));
  const parsed = Number(sp.year);
  const year = parsed >= 2015 && parsed <= thisYear ? parsed : thisYear;
  const vehicleFilter = sp.vehicle ?? '';

  const profile = getTaxProfile();
  const allVehicles = listBusinessVehicles();
  const { vehicles: summaries, unassigned } = vehicleYearSummaries(year);
  const trips = listTrips({ from: `${year}-01-01`, to: `${year}-12-31`, vehicleId: vehicleFilter || undefined });

  const totalTenths = summaries.reduce((n, s) => n + s.businessMilesTenths, 0) + unassigned.milesTenths;
  const totalTrips = summaries.reduce((n, s) => n + s.trips, 0) + unassigned.trips;
  const pending = summaries.reduce((n, s) => n + s.pending, 0) + unassigned.pending;
  const deductionCents = summaries.reduce((n, s) => n + (s.deductionCents ?? 0), 0);
  const rateMills = profile.mileageRates[String(year)] ?? null;

  const href = (y: number, v: string) => {
    const q = new URLSearchParams();
    if (y !== thisYear) q.set('year', String(y));
    if (v) q.set('vehicle', v);
    const s = q.toString();
    return s ? `/admin/mileage?${s}` : '/admin/mileage';
  };
  const years = Array.from({ length: 5 }, (_, i) => thisYear - i);

  const exportQuery = new URLSearchParams({ year: String(year) });
  if (vehicleFilter) exportQuery.set('vehicle', vehicleFilter);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Bookkeeping"
        title="Mileage"
        description="Every business trip, by vehicle. Completed mobile jobs log their round trip from your business address automatically."
        action={<LinkButton href="/admin/settings/tax" variant="secondary" size="sm">Tax profile</LinkButton>}
      />

      {!profile.baseAddress && (
        <Alert tone="warning" title="Set your business address">
          Job trips start and end at your business address. Add it in the{' '}
          <Link href="/admin/settings/tax" className="underline">tax profile</Link> so miles can be looked up.
        </Alert>
      )}
      {rateMills === null && (
        <Alert tone="warning" title={`No IRS mileage rate for ${year}`}>
          Standard-mileage deductions for {year} show as blank until you add the rate in the{' '}
          <Link href="/admin/settings/tax" className="underline">tax profile</Link>.
        </Alert>
      )}

      <nav aria-label="Tax year" className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link key={y} href={href(y, vehicleFilter)} aria-current={y === year ? 'page' : undefined} className={chip(y === year)}>
            {y}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={`${year} business miles`} value={formatMiles(totalTenths)} sub={`${totalTrips} trips`} />
        <StatTile
          label="Standard-mileage deduction"
          value={formatMoney(deductionCents)}
          sub={rateMills !== null ? `at $${(rateMills / 1000).toFixed(3)}/mi` : 'no rate set'}
        />
        <StatTile label="Needs review" value={String(pending)} sub={pending ? 'trips to check' : 'all clear'} />
        <StatTile label="Vehicles" value={String(summaries.length)} sub={`in use in ${year}`} />
      </div>

      {/* Per-vehicle totals */}
      {summaries.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {summaries.map((s) => (
            <Card key={s.vehicle.id}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">{s.vehicle.description}</h2>
                <span className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                  {s.vehicle.deductionMethod === 'standard' ? 'Standard mileage' : 'Actual expenses'}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <dt className="text-subtle">Business miles</dt>
                  <dd className="font-display text-lg font-bold text-white">{formatMiles(s.businessMilesTenths)}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Total miles (odometer)</dt>
                  <dd className="font-display text-lg font-bold text-white">
                    {s.totalMiles !== null ? s.totalMiles.toLocaleString() : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-subtle">Business use</dt>
                  <dd className="font-display text-lg font-bold text-white">
                    {s.businessUsePct !== null ? `${s.businessUsePct.toFixed(1)}%` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-subtle">{s.vehicle.deductionMethod === 'standard' ? 'Mileage deduction' : 'Deduction'}</dt>
                  <dd className="font-display text-lg font-bold text-white">
                    {s.vehicle.deductionMethod === 'standard'
                      ? s.deductionCents !== null
                        ? formatMoney(s.deductionCents)
                        : '—'
                      : 'Expenses'}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[12px] leading-snug text-subtle">
                {s.vehicle.qualifiedNonpersonal
                  ? 'Qualified nonpersonal-use vehicle: 100% business. Trips here support that.'
                  : s.totalMiles === null
                    ? `Add Jan 1 and Dec 31 odometer readings for ${year} to get the business-use %.`
                    : `${s.trips} trips logged.`}
                {s.vehicle.deductionMethod === 'actual' && ' Costs go on the expense ledger (Vehicle, Fuel).'}
                {s.pending > 0 && ` ${s.pending} need review.`}
              </p>
            </Card>
          ))}
        </div>
      )}
      {unassigned.trips > 0 && (
        <Alert tone="warning" title="Trips without a vehicle">
          {unassigned.trips} trip(s), {formatMiles(unassigned.milesTenths)} mi, have no vehicle — edit them to pick one.
        </Alert>
      )}

      {/* Trip log */}
      <section aria-labelledby="trips-heading" className="space-y-4">
        <h2 id="trips-heading" className="eyebrow">
          {year} trips
        </h2>
        <nav aria-label="Vehicle" className="flex flex-wrap gap-2">
          <Link href={href(year, '')} className={chip(!vehicleFilter)}>
            All vehicles
          </Link>
          {allVehicles.map((v) => (
            <Link key={v.id} href={href(year, v.id)} className={chip(vehicleFilter === v.id)}>
              {v.description}
            </Link>
          ))}
          {unassigned.trips > 0 && (
            <Link href={href(year, 'none')} className={chip(vehicleFilter === 'none')}>
              No vehicle
            </Link>
          )}
        </nav>
        <TripLog
          trips={trips}
          vehicles={allVehicles.map((v) => ({
            id: v.id,
            description: v.description,
            activeFrom: v.activeFrom,
            retiredOn: v.retiredOn,
            isDefault: v.isDefault,
          }))}
          baseAddress={profile.baseAddress}
          exportHref={`/api/mileage/export?${exportQuery.toString()}`}
          exportLabel={`Export ${year} CSV`}
        />
      </section>

      <section aria-labelledby="vehicles-heading">
        <Card>
          <h2 id="vehicles-heading" className="eyebrow mb-4">
            Business vehicles
          </h2>
          <BusinessVehicleManager vehicles={allVehicles} />
        </Card>
      </section>

      <p className="text-[12px] leading-relaxed text-subtle">
        Distances come from OpenStreetMap driving directions. A record-keeping tool for your tax preparer,
        not tax advice. Standard mileage and actual expenses cannot both be claimed for the same vehicle.
      </p>
    </div>
  );
}

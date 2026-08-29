// ─────────────────────────────────────────────────────────────────────────────
// /admin/schedule — every appointment, filterable.
//
// The filter is a plain GET <form>. No client component, no onChange handler,
// no state: submitting navigates to a URL that fully describes the view, so a
// filtered schedule can be bookmarked, sent to a colleague, and reloaded by the
// back button. The only JavaScript on the page is the per-row action widget.
//
// Filters are applied INSIDE `listAppointments` — that is, in SQL — rather than
// by fetching everything and filtering in JS. At a few thousand rows the
// difference is invisible, but the habit is what keeps the page correct once it
// is not.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import {
  Card,
  CardTitle,
  EmptyState,
  LinkButton,
  PageHeader,
  StatusBadge,
} from '@/components/ui';
import AppointmentActions from '@/components/admin/AppointmentActions';
import { requireRolePage } from '@/lib/guards';
import { listAppointments } from '@/lib/repo/appointments';
import { listUsers } from '@/lib/repo/users';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { APPOINTMENT_STATUSES, AppointmentStatus, STAFF_ROLES } from '@/lib/models';
import { addDaysIso, dateAtMinutes, formatDateTime, todayIso } from '@/lib/timezone';
import { formatCurrency } from '@/lib/pricing';
import { getService } from '@/data/pricing';

export const dynamic = 'force-dynamic';

interface Search {
  from?: string;
  to?: string;
  status?: string;
  employee?: string;
  q?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminSchedulePage({ searchParams }: { searchParams?: Promise<Search> }) {
  await requireRolePage('manager', '/admin/schedule');
  const { timezone } = getSchedulingConfig();
  const today = todayIso(timezone);
  const sp = (await searchParams) ?? {};

  // Defaults: today through four weeks out — the window a manager actually
  // works in. Past bookings are one date change away, not a separate screen.
  const fromDate = ISO_DATE.test(sp.from ?? '') ? sp.from! : today;
  const toDate = ISO_DATE.test(sp.to ?? '') ? sp.to! : addDaysIso(today, 28);

  const status = (APPOINTMENT_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as AppointmentStatus)
    : undefined;

  const technicians = listUsers({ roles: STAFF_ROLES, activeOnly: true, limit: 200 });
  const employeeId = technicians.some((t) => t.id === sp.employee) ? sp.employee : undefined;

  const appointments = listAppointments({
    // The end date is inclusive to a human, so the query runs to the following
    // local midnight. Without the +1 day, "to: today" would return nothing.
    from: dateAtMinutes(fromDate, 0, timezone).toISOString(),
    to: dateAtMinutes(addDaysIso(toDate, 1), 0, timezone).toISOString(),
    statuses: status ? [status] : undefined,
    employeeId,
    search: sp.q || undefined,
    direction: 'all',
    limit: 500,
  })
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const total = appointments.reduce(
    (sum, a) => (a.status === 'cancelled' || a.status === 'no_show' ? sum : sum + a.quotedTotal),
    0
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Schedule"
        description="Every booking in the range, whoever it belongs to."
        action={<LinkButton href="/admin/estimates" variant="secondary" size="sm">Estimate queue</LinkButton>}
      />

      <Card className="mb-6">
        <CardTitle>Filter</CardTitle>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="from" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              From
            </label>
            <input id="from" name="from" type="date" defaultValue={fromDate} className="input-field" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="to" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              To
            </label>
            <input id="to" name="to" type="date" defaultValue={toDate} className="input-field" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="status" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Status
            </label>
            <select id="status" name="status" defaultValue={status ?? ''} className="input-field">
              <option value="">Any status</option>
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="employee" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Technician
            </label>
            <select id="employee" name="employee" defaultValue={employeeId ?? ''} className="input-field">
              <option value="">Anyone</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="q" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={(await searchParams)?.q ?? ''}
              placeholder="Name, email, reference"
              className="input-field"
            />
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="rounded-sm bg-apex px-5 py-2.5 text-sm font-medium text-white hover:bg-apex/90">
              Apply
            </button>
            <Link
              href="/admin/schedule"
              className="px-3 py-2.5 text-sm text-muted transition-colors hover:text-white"
            >
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        <CardTitle
          action={
            <span className="font-mono text-[11px] text-muted">
              {appointments.length} booking{appointments.length === 1 ? '' : 's'} ·{' '}
              {formatCurrency(total)}
            </span>
          }
        >
          {fromDate} → {toDate}
        </CardTitle>

        {appointments.length === 0 ? (
          <EmptyState
            title="Nothing in this range"
            description="Widen the dates or clear the filters. Cancelled bookings are included only when you ask for them."
            action={<LinkButton href="/admin/schedule" variant="secondary" size="sm">Reset filters</LinkButton>}
          />
        ) : (
          <ul className="space-y-3">
            {appointments.map((a) => (
              <li
                key={a.id}
                className="rounded-sm border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                      {formatDateTime(a.startsAt, timezone)} · {a.reference}
                    </p>
                    <Link
                      href={`/admin/appointments/${a.id}`}
                      className="mt-1 block truncate font-display text-base font-semibold text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                    >
                      {a.customerName}
                    </Link>
                    <p className="text-[13px] text-muted">
                      {[a.vehicleLabel, a.serviceIds.map((id) => getService(id)?.name ?? id).join(', ')]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {a.address && <p className="text-[12px] text-subtle">{a.address}</p>}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge status={a.status} />
                    <span className="font-mono text-[12px] text-muted">
                      {formatCurrency(a.quotedTotal)}
                    </span>
                    <span className="font-mono text-[11px] text-subtle">
                      {a.employeeName ?? 'Unassigned'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 border-t border-white/5 pt-3">
                  <AppointmentActions
                    appointmentId={a.id}
                    employeeId={a.employeeId}
                    status={a.status}
                    technicians={technicians.map((t) => ({ id: t.id, name: t.name }))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

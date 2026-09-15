// ─────────────────────────────────────────────────────────────────────────────
// /admin/schedule — every appointment, filterable, plus a month calendar.
//
// The filter is a plain GET <form>. No client component, no onChange handler,
// no state: submitting navigates to a URL that fully describes the view, so a
// filtered schedule can be bookmarked, sent to a colleague, and reloaded by the
// back button. The only JavaScript on the page is the per-row action widget
// and the calendar's "which day is expanded" state.
//
// Layout (top to bottom): header with the Filter + Estimate queue buttons,
// the filter card (only when ?filters=1 — the Filter button toggles that
// param, so even the disclosure is a link), the bookings list for the range,
// then a full-month calendar. The calendar has its own ?month=YYYY-MM so
// paging through months never disturbs the list's date range.
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
import MonthCalendar, { CalendarBooking } from '@/components/admin/MonthCalendar';
import { requireRolePage } from '@/lib/guards';
import { listAppointments } from '@/lib/repo/appointments';
import { listUsers } from '@/lib/repo/users';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { APPOINTMENT_STATUSES, AppointmentStatus, STAFF_ROLES } from '@/lib/models';
import {
  addDaysIso,
  dateAtMinutes,
  formatDateTime,
  formatTime,
  todayIso,
  toLocalParts,
} from '@/lib/timezone';
import { formatCurrency } from '@/lib/pricing';
import { getService } from '@/data/pricing';

export const dynamic = 'force-dynamic';

interface Search {
  from?: string;
  to?: string;
  status?: string;
  employee?: string;
  q?: string;
  /** '1' when the filter card is expanded. */
  filters?: string;
  /** 'YYYY-MM' — the month the calendar shows. */
  month?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Builds a /admin/schedule URL from the current params with some overridden. */
function hrefWith(sp: Search, overrides: Partial<Search>): string {
  const merged: Record<string, string | undefined> = { ...sp, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/admin/schedule?${s}` : '/admin/schedule';
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function AdminSchedulePage({ searchParams }: { searchParams?: Promise<Search> }) {
  await requireRolePage('manager', '/admin/schedule');
  const { timezone } = getSchedulingConfig();
  const today = todayIso(timezone);
  const sp = (await searchParams) ?? {};

  // Defaults: today through four weeks out — the window a manager actually
  // works in. Past bookings are one date change away, not a separate screen.
  const fromDate = ISO_DATE.test(sp.from ?? '') ? sp.from! : today;
  const toDate = ISO_DATE.test(sp.to ?? '') ? sp.to! : addDaysIso(today, 28);
  const filtersOpen = sp.filters === '1';

  const status = (APPOINTMENT_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as AppointmentStatus)
    : undefined;

  const technicians = listUsers({ roles: STAFF_ROLES, activeOnly: true, limit: 200 });
  const employeeId = technicians.some((t) => t.id === sp.employee) ? sp.employee : undefined;

  // Status / technician / search apply to BOTH the list and the calendar, so
  // the two never disagree about which bookings exist. Only the dates differ.
  const sharedFilters = {
    statuses: status ? [status] : undefined,
    employeeId,
    search: sp.q || undefined,
    direction: 'all' as const,
  };

  const appointments = listAppointments({
    ...sharedFilters,
    // The end date is inclusive to a human, so the query runs to the following
    // local midnight. Without the +1 day, "to: today" would return nothing.
    from: dateAtMinutes(fromDate, 0, timezone).toISOString(),
    to: dateAtMinutes(addDaysIso(toDate, 1), 0, timezone).toISOString(),
    limit: 500,
  })
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const total = appointments.reduce(
    (sum, a) => (a.status === 'cancelled' || a.status === 'no_show' ? sum : sum + a.quotedTotal),
    0
  );

  // ── Calendar month ──────────────────────────────────────────────────────────
  const month = ISO_MONTH.test(sp.month ?? '') ? sp.month! : today.slice(0, 7);
  const monthStart = `${month}-01`;
  const nextMonthStart = `${shiftMonth(month, 1)}-01`;

  const monthAppointments = listAppointments({
    ...sharedFilters,
    from: dateAtMinutes(monthStart, 0, timezone).toISOString(),
    to: dateAtMinutes(nextMonthStart, 0, timezone).toISOString(),
    limit: 1000,
  })
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const bookingsByDay: Record<string, CalendarBooking[]> = {};
  for (const a of monthAppointments) {
    const day = toLocalParts(new Date(a.startsAt), timezone).dateIso;
    (bookingsByDay[day] ??= []).push({
      id: a.id,
      time: formatTime(a.startsAt, timezone),
      customerName: a.customerName,
      status: a.status,
      services: a.serviceIds.map((id) => getService(id)?.name ?? id).join(', '),
      employeeName: a.employeeName ?? 'Unassigned',
      total: formatCurrency(a.quotedTotal),
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Schedule"
        description="Every booking in the range, whoever it belongs to."
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={hrefWith(sp, { filters: filtersOpen ? undefined : '1' })}
              variant="secondary"
              size="sm"
            >
              {filtersOpen ? 'Hide filter' : 'Filter'}
            </LinkButton>
            <LinkButton href="/admin/estimates" variant="secondary" size="sm">
              Estimate queue
            </LinkButton>
          </div>
        }
      />

      {filtersOpen && (
        <Card className="mb-6">
          <CardTitle>Filter</CardTitle>
          {/* `min-w-0` on every cell: a native date input has an intrinsic
              minimum width on iOS/Chrome, and a grid child defaults to
              min-width:auto, so without this the From/To boxes overflowed the
              card on a phone instead of shrinking with their column. */}
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Keeps the card open after Apply so the applied values stay visible. */}
            <input type="hidden" name="filters" value="1" />
            {sp.month && <input type="hidden" name="month" value={sp.month} />}

            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="from" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                From
              </label>
              <input id="from" name="from" type="date" defaultValue={fromDate} className="input-field" />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="to" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                To
              </label>
              <input id="to" name="to" type="date" defaultValue={toDate} className="input-field" />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
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

            <div className="flex min-w-0 flex-col gap-1.5">
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

            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="q" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                Search
              </label>
              <input
                id="q"
                name="q"
                defaultValue={sp.q ?? ''}
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
      )}

      <Card className="mb-6">
        <CardTitle
          action={
            <span className="font-mono text-[11px] text-muted">
              {appointments.length} booking{appointments.length === 1 ? '' : 's'} ·{' '}
              {formatCurrency(total)}
            </span>
          }
        >
          My bookings · {fromDate} → {toDate}
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
                    {a.source === 'estimate' && (
                      <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest2 text-amber-200">
                        Estimate hold
                      </span>
                    )}
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

      <Card>
        <CardTitle>Calendar</CardTitle>
        <MonthCalendar
          month={month}
          today={today}
          bookingsByDay={bookingsByDay}
          prevHref={hrefWith(sp, { month: shiftMonth(month, -1) })}
          nextHref={hrefWith(sp, { month: shiftMonth(month, 1) })}
        />
      </Card>
    </>
  );
}

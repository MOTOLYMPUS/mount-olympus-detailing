// ─────────────────────────────────────────────────────────────────────────────
// /staff/schedule — the technician's next 14 days, grouped by day.
//
// Grouping is done in JS from ONE ordered query rather than 14 queries in a
// loop. The grouping key is the LOCAL date derived through lib/timezone.ts, not
// `startsAt.slice(0,10)`: an 8 p.m. Central appointment is stored as the
// following day in UTC, and slicing the string would file it under tomorrow.
//
// Empty days are rendered too. A blank Thursday is information — it is when the
// technician can be offered extra work — and hiding it makes the fortnight read
// as denser than it is.
// ─────────────────────────────────────────────────────────────────────────────

import { Card, CardTitle, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import JobCard from '@/components/staff/JobCard';
import { requireStaffPage } from '@/lib/guards';
import { listAppointments } from '@/lib/repo/appointments';
import { getJobByAppointment } from '@/lib/repo/jobs';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { addDaysIso, dateAtMinutes, eachDate, formatDate, toLocalParts, todayIso } from '@/lib/timezone';
import { formatHours } from '@/lib/pricing';
import { AppointmentView } from '@/lib/models';

export const dynamic = 'force-dynamic';

const DAYS = 14;

export default async function StaffSchedulePage() {
  const user = await requireStaffPage('/staff/schedule');
  const { timezone } = getSchedulingConfig();

  const today = todayIso(timezone);
  const lastDay = addDaysIso(today, DAYS - 1);

  // lib/periods.ts is anchored on an END date; this window looks FORWARD, so
  // the two local midnights are taken directly.
  const from = dateAtMinutes(today, 0, timezone).toISOString();
  const to = dateAtMinutes(addDaysIso(lastDay, 1), 0, timezone).toISOString();

  const appointments = listAppointments({
    employeeId: user.id,
    from,
    to,
    direction: 'all',
    limit: 200,
  })
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const byDate = new Map<string, AppointmentView[]>();
  for (const appointment of appointments) {
    const key = toLocalParts(new Date(appointment.startsAt), timezone).dateIso;
    const list = byDate.get(key) ?? [];
    list.push(appointment);
    byDate.set(key, list);
  }

  const days = eachDate(today, lastDay);

  return (
    <>
      <PageHeader
        eyebrow="Next 14 days"
        title="Your schedule"
        description={`${appointments.length} appointment${appointments.length === 1 ? '' : 's'} assigned to you between ${formatDate(dateAtMinutes(today, 12 * 60, timezone), timezone)} and ${formatDate(dateAtMinutes(lastDay, 12 * 60, timezone), timezone)}.`}
        action={<LinkButton href="/staff/jobs" variant="secondary" size="sm">All jobs</LinkButton>}
      />

      {appointments.length === 0 ? (
        <EmptyState
          title="No work scheduled"
          description="Nothing is assigned to you in the next two weeks. Past jobs are still available under All jobs."
          action={<LinkButton href="/staff/jobs" variant="secondary" size="sm">All jobs</LinkButton>}
        />
      ) : (
        <div className="space-y-6">
          {days.map((date) => {
            const dayAppointments = byDate.get(date) ?? [];
            const hours = dayAppointments.reduce((sum, a) => sum + a.estimatedHours, 0);

            return (
              <Card key={date} as="section">
                <CardTitle
                  action={
                    dayAppointments.length ? (
                      <span className="font-mono text-[11px] text-muted">
                        {dayAppointments.length} job{dayAppointments.length === 1 ? '' : 's'} ·{' '}
                        {formatHours(hours)}
                      </span>
                    ) : undefined
                  }
                >
                  {formatDate(dateAtMinutes(date, 12 * 60, timezone), timezone)}
                  {date === today ? ' · Today' : ''}
                </CardTitle>

                {dayAppointments.length === 0 ? (
                  <p className="py-3 text-[13px] text-subtle">Nothing scheduled.</p>
                ) : (
                  <ul className="space-y-4">
                    {dayAppointments.map((appointment) => (
                      <JobCard
                        key={appointment.id}
                        appointment={appointment}
                        job={getJobByAppointment(appointment.id)}
                        timezone={timezone}
                        role={user.role}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

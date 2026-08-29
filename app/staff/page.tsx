// ─────────────────────────────────────────────────────────────────────────────
// /staff — "Today".
//
// The one screen a technician opens at 7 a.m. Everything above the fold is what
// they need in the next hour: who, where, what, and one button per job.
//
// ⚠️ REVENUE IS ROLE-GATED. A technician sees their own throughput and their own
// customer rating; they do NOT see what the business billed. `canManage()` is
// the switch, and it gates the DATA FETCH as well as the markup — rendering the
// tile conditionally while still querying revenue would put the number in the
// server component's payload where anyone can read it in the page source.
// ─────────────────────────────────────────────────────────────────────────────

import { Card, CardTitle, EmptyState, LinkButton, StatTile } from '@/components/ui';
import { PageHeader } from '@/components/ui';
import JobCard from '@/components/staff/JobCard';
import { requireStaffPage } from '@/lib/guards';
import { listAppointments } from '@/lib/repo/appointments';
import { getJobByAppointment } from '@/lib/repo/jobs';
import { statsForEmployee } from '@/lib/repo/jobs';
import { revenueBetween } from '@/lib/repo/appointments';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { canManage } from '@/lib/rbac';
import { dayPeriod, weekPeriod } from '@/lib/periods';
import { formatDate, todayIso } from '@/lib/timezone';
import { formatCurrency, formatHours } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function StaffTodayPage() {
  const user = await requireStaffPage('/staff');
  const { timezone } = getSchedulingConfig();

  const today = todayIso(timezone);
  const day = dayPeriod(today, timezone);
  const week = weekPeriod(today, timezone);

  // Managers cover for technicians, so their "today" is their OWN assigned work
  // — the whole-business view is /admin/schedule. Filtering by employeeId for
  // every staff role keeps this screen meaning one thing.
  const todaysAppointments = listAppointments({
    employeeId: user.id,
    from: day.from,
    to: day.to,
    direction: 'all',
    limit: 50,
  })
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const hoursToday = todaysAppointments
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .reduce((sum, a) => sum + a.estimatedHours, 0);

  const weekStats = statsForEmployee(user.id, week.from, week.to);
  const completedThisWeek = weekStats?.jobsCompleted ?? 0;

  const showMoney = canManage(user.role);
  const weekRevenue = showMoney ? revenueBetween(week.from, week.to).revenue : null;

  return (
    <>
      <PageHeader
        eyebrow={formatDate(day.from, timezone)}
        title={`Good to go, ${user.name.split(' ')[0] || 'there'}`}
        description="Your assigned work for today. Tap a job to run it."
        action={<LinkButton href="/staff/schedule" variant="secondary" size="sm">Next 14 days</LinkButton>}
      />

      <section aria-label="Today at a glance" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Jobs today" value={String(todaysAppointments.length)} />
        <StatTile label="Hours booked" value={hoursToday ? formatHours(hoursToday) : '0 hrs'} />
        <StatTile label="Completed this week" value={String(completedThisWeek)} />

        {showMoney ? (
          <StatTile
            label="Revenue this week"
            value={formatCurrency(weekRevenue ?? 0)}
            sub="Completed jobs"
          />
        ) : (
          <StatTile
            label="Your rating"
            value={
              weekStats?.averageRating ? `${weekStats.averageRating.toFixed(1)} / 5` : 'No ratings'
            }
            sub={
              weekStats?.ratingCount
                ? `${weekStats.ratingCount} rated this week`
                : 'Ask customers to rate at handover'
            }
          />
        )}
      </section>

      <Card>
        <CardTitle>Today&rsquo;s jobs</CardTitle>
        {todaysAppointments.length === 0 ? (
          <EmptyState
            title="Nothing booked for today"
            description="You have no assigned appointments. Check the next two weeks, or ask a manager if you expected work."
            action={<LinkButton href="/staff/schedule" variant="secondary" size="sm">Open schedule</LinkButton>}
          />
        ) : (
          <ul className="space-y-4">
            {todaysAppointments.map((appointment) => (
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
    </>
  );
}

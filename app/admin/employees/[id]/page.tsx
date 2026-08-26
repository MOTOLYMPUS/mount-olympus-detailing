// ─────────────────────────────────────────────────────────────────────────────
// /admin/employees/:id — one staff member.
//
// `editable` is computed HERE, from the same rank comparison the API applies,
// and passed to the editor. Two places compute it because they answer different
// questions: the server component decides what to SHOW, the route decides what
// to ALLOW. If they ever disagree, the route wins and the screen looks broken —
// which is the correct failure direction.
//
// A customer id 404s. This screen exposes hourly rate and internal notes; it
// must never render a customer record just because the id was pasted in.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  Field,
  LinkButton,
  PageHeader,
  StatTile,
  StatusBadge,
} from '@/components/ui';
import EmployeeEditor from '@/components/admin/EmployeeEditor';
import { requireRolePage } from '@/lib/guards';
import { getUser } from '@/lib/repo/users';
import { statsForEmployee } from '@/lib/repo/jobs';
import { listAppointments } from '@/lib/repo/appointments';
import { getSchedulingConfig, listShifts, listTimeOff } from '@/lib/repo/settings';
import { isStaff, rank, assignableRoles, ROLE_LABEL } from '@/lib/rbac';
import { resolvePeriod } from '@/lib/periods';
import { formatDate, formatDateTime, relativeTime } from '@/lib/timezone';
import { formatCurrency, formatHours } from '@/lib/pricing';
import { getService } from '@/data/pricing';

export const dynamic = 'force-dynamic';

export default function AdminEmployeePage({ params }: { params: { id: string } }) {
  const actor = requireRolePage('admin', `/admin/employees/${params.id}`);
  const { timezone } = getSchedulingConfig();

  const employee = getUser(params.id);
  if (!employee || !isStaff(employee.role)) notFound();

  // The rank rule, mirrored from app/api/admin/employees/[id]/route.ts. Strictly
  // below, so equal rank (two admins) and self are both read-only.
  const editable = rank(actor.role) > rank(employee.role);

  const shifts = listShifts(employee.id);
  const timeOff = listTimeOff({ employeeId: employee.id });

  const period = resolvePeriod('30d', timezone);
  const stats = statsForEmployee(employee.id, period.from, period.to);

  const upcoming = listAppointments({
    employeeId: employee.id,
    direction: 'upcoming',
    limit: 20,
  });

  return (
    <>
      <PageHeader
        eyebrow={ROLE_LABEL[employee.role]}
        title={employee.name}
        description={
          employee.hiredAt
            ? `Joined ${formatDate(employee.hiredAt, timezone)} · ${relativeTime(employee.hiredAt)}`
            : 'Start date not recorded'
        }
        action={
          <LinkButton href="/admin/employees" variant="ghost" size="sm">
            ← Staff
          </LinkButton>
        }
      />

      <section aria-label="Performance" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Jobs, 30 days" value={String(stats?.jobsCompleted ?? 0)} />
        <StatTile label="Revenue, 30 days" value={formatCurrency(stats?.revenue ?? 0)} />
        <StatTile
          label="Average job"
          value={stats?.averageCompletionMinutes ? `${stats.averageCompletionMinutes} min` : '—'}
          sub={stats?.averageJobValue ? formatCurrency(stats.averageJobValue) : undefined}
        />
        <StatTile
          label="Rating"
          value={stats?.averageRating ? `${stats.averageRating.toFixed(1)} / 5` : '—'}
          sub={`${stats?.ratingCount ?? 0} rated`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <EmployeeEditor
            employee={employee}
            shifts={shifts}
            timeOff={timeOff}
            assignable={assignableRoles(actor.role).filter((r) => r !== 'customer')}
            editable={editable}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardTitle
              action={
                <Badge tone={employee.active ? 'positive' : 'danger'}>
                  {employee.active ? 'Active' : 'Deactivated'}
                </Badge>
              }
            >
              Record
            </CardTitle>
            <dl>
              <Field label="Email">{employee.email}</Field>
              <Field label="Phone">{employee.phone || 'Not provided'}</Field>
              <Field label="Rate">
                {employee.hourlyRate === null
                  ? 'Salaried / not set'
                  : `${formatCurrency(employee.hourlyRate / 100)} per hour`}
              </Field>
              <Field label="Last sign in">
                {employee.lastLoginAt ? relativeTime(employee.lastLoginAt) : 'Never'}
              </Field>
              {employee.deactivatedAt && (
                <Field label="Deactivated">{formatDate(employee.deactivatedAt, timezone)}</Field>
              )}
              <Field label="Minutes worked">{stats?.minutesWorked ?? 0}</Field>
            </dl>
          </Card>

          <Card>
            <CardTitle
              action={<span className="font-mono text-[11px] text-muted">{upcoming.length}</span>}
            >
              Upcoming work
            </CardTitle>

            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing assigned"
                description="Assign work from the schedule. Their shifts above decide which slots the booking calendar offers."
              />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/admin/appointments/${a.id}`}
                        className="block truncate text-[13px] text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                      >
                        {formatDateTime(a.startsAt, timezone)}
                      </Link>
                      <p className="truncate text-[12px] text-subtle">
                        {a.customerName} ·{' '}
                        {a.serviceIds.map((id) => getService(id)?.name ?? id).join(', ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[11px] text-subtle">
                        {formatHours(a.estimatedHours)}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

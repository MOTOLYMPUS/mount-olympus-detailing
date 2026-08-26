// ─────────────────────────────────────────────────────────────────────────────
// /admin/employees — the staff list.
//
// requireRolePage('admin'), not 'manager'. Hiring, firing and pay are not
// scheduling decisions, and a manager who could edit roles could promote
// themselves the moment `assignableRoles` was ever loosened.
//
// The "add" form is given `assignableRoles(user.role)` from the SERVER. That is
// a convenience so an admin is not offered 'owner' and then refused — the
// binding check is in the POST handler, which recomputes the same list.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Badge, Card, CardTitle, EmptyState, PageHeader, StatTile } from '@/components/ui';
import NewEmployeeForm from '@/components/admin/NewEmployeeForm';
import { requireRolePage } from '@/lib/guards';
import { listUsers } from '@/lib/repo/users';
import { employeeStats } from '@/lib/repo/jobs';
import { getSchedulingConfig, listShifts } from '@/lib/repo/settings';
import { STAFF_ROLES } from '@/lib/models';
import { ROLE_LABEL, assignableRoles } from '@/lib/rbac';
import { resolvePeriod } from '@/lib/periods';
import { formatDate } from '@/lib/timezone';
import { formatCurrency } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default function AdminEmployeesPage() {
  const user = requireRolePage('admin', '/admin/employees');
  const { timezone } = getSchedulingConfig();

  // Inactive staff are INCLUDED. A list that hides them makes reactivating
  // someone impossible and quietly loses the record that they ever worked here.
  const staff = listUsers({ roles: STAFF_ROLES, limit: 200 });

  const period = resolvePeriod('30d', timezone);
  const stats = new Map(employeeStats(period.from, period.to).map((s) => [s.employeeId, s]));

  const active = staff.filter((s) => s.active);
  const payroll = active.reduce((sum, s) => sum + (s.hourlyRate ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Staff"
        description="Roles, pay, shifts and performance. Changes here take effect immediately."
      />

      <section aria-label="Team totals" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active staff" value={String(active.length)} sub={`${staff.length} on record`} />
        <StatTile
          label="Technicians"
          value={String(active.filter((s) => s.role === 'employee').length)}
        />
        <StatTile
          label="Combined hourly"
          value={formatCurrency(payroll / 100)}
          sub="Active staff with a rate"
        />
        <StatTile
          label="Jobs, last 30 days"
          value={String(Array.from(stats.values()).reduce((sum, s) => sum + s.jobsCompleted, 0))}
        />
      </section>

      <Card className="mb-6">
        <CardTitle>Add someone</CardTitle>
        <NewEmployeeForm roles={assignableRoles(user.role).filter((r) => r !== 'customer')} />
      </Card>

      <Card>
        <CardTitle
          action={<span className="font-mono text-[11px] text-muted">Last 30 days</span>}
        >
          Everyone
        </CardTitle>

        {staff.length === 0 ? (
          <EmptyState
            title="No staff yet"
            description="Add your first technician above. They get a one-time password you pass on directly."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  <th scope="col" className="py-2 pr-3 font-normal">Name</th>
                  <th scope="col" className="py-2 pr-3 font-normal">Role</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Rate</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Shifts</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Jobs</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Revenue</th>
                  <th scope="col" className="py-2 text-right font-normal">Hired</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => {
                  const stat = stats.get(person.id);
                  return (
                    <tr key={person.id} className="border-b border-white/5 last:border-0">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/admin/employees/${person.id}`}
                          className="text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                        >
                          {person.name}
                        </Link>
                        <span className="block truncate text-[12px] text-subtle">{person.email}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={person.active ? 'neutral' : 'danger'}>
                          {person.active ? ROLE_LABEL[person.role] : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-muted">
                        {person.hourlyRate === null ? '—' : `${formatCurrency(person.hourlyRate / 100)}/h`}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-muted">
                        {listShifts(person.id).length}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-muted">
                        {stat?.jobsCompleted ?? 0}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono text-white">
                        {formatCurrency(stat?.revenue ?? 0)}
                      </td>
                      <td className="py-2.5 text-right text-[12px] text-muted">
                        {person.hiredAt ? formatDate(person.hiredAt, timezone) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

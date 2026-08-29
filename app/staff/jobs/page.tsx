// ─────────────────────────────────────────────────────────────────────────────
// /staff/jobs — every job assigned to the signed-in technician.
//
// The status filter is a set of LINKS, not a <select> with an onChange. That
// keeps the whole page a server component: each filter is a real URL that can
// be bookmarked, shared with a manager, and opened by the back button, and the
// screen works before any JavaScript has loaded — which matters when the
// technician is on one bar of signal in an underground car park.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import clsx from 'clsx';
import { Card, CardTitle, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import JobCard from '@/components/staff/JobCard';
import { requireStaffPage } from '@/lib/guards';
import { listJobsForEmployee } from '@/lib/repo/jobs';
import { getAppointmentView } from '@/lib/repo/appointments';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { JobStatus } from '@/lib/models';
import { formatDate } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

const FILTERS: { key: string; label: string; statuses?: JobStatus[] }[] = [
  { key: 'active', label: 'Active', statuses: ['assigned', 'in_progress', 'paused'] },
  { key: 'in_progress', label: 'In progress', statuses: ['in_progress', 'paused'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'all', label: 'All' },
];

export default async function StaffJobsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const user = await requireStaffPage('/staff/jobs');
  const { timezone } = getSchedulingConfig();

  // Unknown values fall back to 'active' rather than erroring — a mistyped URL
  // should show the useful default, not a stack trace.
  const sp = (await searchParams) ?? {};
  const active = FILTERS.find((f) => f.key === sp.status) ?? FILTERS[0];

  const jobs = listJobsForEmployee(user.id, active.statuses);

  // The job row carries no customer or address, so each one is paired with its
  // appointment view here. N+1 by construction; at a technician's realistic job
  // count (tens, not thousands) a join in the repo would be premature.
  const rows = jobs
    .map((job) => ({ job, appointment: getAppointmentView(job.appointmentId) }))
    .filter((r): r is { job: (typeof jobs)[number]; appointment: NonNullable<ReturnType<typeof getAppointmentView>> } =>
      r.appointment !== null
    )
    .sort((a, b) => b.appointment.startsAt.localeCompare(a.appointment.startsAt));

  return (
    <>
      <PageHeader
        eyebrow="My work"
        title="Jobs"
        description="Everything assigned to you, newest first."
        action={<LinkButton href="/staff" variant="secondary" size="sm">Today</LinkButton>}
      />

      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={filter.key === 'active' ? '/staff/jobs' : `/staff/jobs?status=${filter.key}`}
            aria-current={filter.key === active.key ? 'page' : undefined}
            className={clsx(
              'rounded-full border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest2 transition-colors',
              filter.key === active.key
                ? 'border-apex bg-apex/10 text-white'
                : 'border-white/20 text-muted hover:border-white/50 hover:text-white'
            )}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      <Card>
        <CardTitle
          action={
            <span className="font-mono text-[11px] text-muted">
              {rows.length} job{rows.length === 1 ? '' : 's'}
            </span>
          }
        >
          {active.label}
        </CardTitle>

        {rows.length === 0 ? (
          <EmptyState
            title="No jobs here"
            description={
              active.key === 'completed'
                ? 'Nothing completed yet. Finished jobs appear here with their photos and signature.'
                : 'Nothing assigned to you with this status. Try the All filter.'
            }
            action={<LinkButton href="/staff/jobs?status=all" variant="secondary" size="sm">Show all</LinkButton>}
          />
        ) : (
          <ul className="space-y-4">
            {rows.map(({ job, appointment }) => (
              <JobCard
                key={job.id}
                appointment={appointment}
                job={job}
                timezone={timezone}
                role={user.role}
                showDate={formatDate(appointment.startsAt, timezone)}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

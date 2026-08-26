// ─────────────────────────────────────────────────────────────────────────────
// /staff/jobs/:id — the job runner.
//
// A SERVER component that loads the job, its appointment and its photos, checks
// `canViewJob` against the loaded row, and hands the result to the one client
// component on the screen. Everything above the runner — customer, address,
// phone, services — is static for the life of the visit and therefore stays on
// the server, out of the JavaScript bundle.
//
// A job that is not yours 404s rather than 403s. `notFound()` and "you may not
// see this" are the same statement to someone guessing ids, and the former does
// not confirm the id exists.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge, Card, CardTitle, Field, LinkButton, PageHeader } from '@/components/ui';
import JobRunner from '@/components/staff/JobRunner';
import { mapsHref, serviceNames, telHref } from '@/components/staff/JobCard';
import { requireStaffPage } from '@/lib/guards';
import { getJob, listJobPhotos } from '@/lib/repo/jobs';
import { getAppointmentView } from '@/lib/repo/appointments';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { canManage, canViewJob } from '@/lib/rbac';
import { formatDateTime } from '@/lib/timezone';
import { formatCurrency, formatHours } from '@/lib/pricing';
import { getAddOn } from '@/data/pricing';

export const dynamic = 'force-dynamic';

export default function JobRunnerPage({ params }: { params: { id: string } }) {
  const user = requireStaffPage(`/staff/jobs/${params.id}`);
  const { timezone } = getSchedulingConfig();

  const job = getJob(params.id);
  if (!job || !canViewJob(user, job)) notFound();

  const appointment = getAppointmentView(job.appointmentId);
  if (!appointment) notFound();

  const photos = listJobPhotos(job.id);
  const services = serviceNames(appointment.serviceIds);
  const addOns = appointment.addOnIds.map((id) => getAddOn(id)?.name ?? id);
  const address = appointment.address.trim();

  return (
    <>
      <PageHeader
        eyebrow={appointment.reference}
        title={appointment.customerName}
        description={formatDateTime(appointment.startsAt, timezone)}
        action={
          <LinkButton href="/staff/jobs" variant="ghost" size="sm">
            ← All jobs
          </LinkButton>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 lg:order-2">
          <Card>
            <CardTitle>Job sheet</CardTitle>
            <dl>
              <Field label="Vehicle">{appointment.vehicleLabel ?? 'Not recorded'}</Field>
              <Field label="Where">
                {address ? (
                  <a
                    href={mapsHref(address)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline decoration-white/20 underline-offset-4 hover:text-flare"
                  >
                    {address}
                  </a>
                ) : (
                  'At the shop'
                )}
              </Field>
              <Field label="Phone">
                {appointment.customerPhone ? (
                  <a
                    href={telHref(appointment.customerPhone)}
                    className="font-mono underline decoration-white/20 underline-offset-4 hover:text-flare"
                  >
                    {appointment.customerPhone}
                  </a>
                ) : (
                  'Not provided'
                )}
              </Field>
              <Field label="Allowed">{formatHours(appointment.estimatedHours)}</Field>
              {canManage(user.role) && (
                <Field label="Quoted">{formatCurrency(appointment.quotedTotal)}</Field>
              )}
              <Field label="Booking">
                <StatusLink appointmentId={appointment.id} canManage={canManage(user.role)} />
              </Field>
            </dl>

            <div className="mt-4 space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">Services</p>
              <ul className="flex flex-wrap gap-1.5">
                {services.map((name) => (
                  <li key={name}>
                    <Badge>{name}</Badge>
                  </li>
                ))}
                {addOns.map((name) => (
                  <li key={name}>
                    <Badge tone="info">{name}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            {appointment.notes && (
              <p className="mt-4 whitespace-pre-line rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] leading-relaxed text-muted">
                {appointment.notes}
              </p>
            )}
          </Card>
        </div>

        <div className="min-w-0 lg:order-1">
          <JobRunner
            initialJob={job}
            initialPhotos={photos}
            customerName={appointment.customerName}
            quotedTotal={appointment.quotedTotal}
            showMoney={canManage(user.role)}
          />
        </div>
      </div>
    </>
  );
}

/** Managers get a link through to the admin detail screen; technicians do not. */
function StatusLink({ appointmentId, canManage }: { appointmentId: string; canManage: boolean }) {
  if (!canManage) return <span className="text-muted">Scheduled</span>;
  return (
    <Link
      href={`/admin/appointments/${appointmentId}`}
      className="underline decoration-white/20 underline-offset-4 hover:text-flare"
    >
      Open booking
    </Link>
  );
}

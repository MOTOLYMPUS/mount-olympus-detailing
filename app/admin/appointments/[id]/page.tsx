// ─────────────────────────────────────────────────────────────────────────────
// /admin/appointments/:id — one booking, in full, with the actions that change
// it.
//
// This is the screen someone opens with a customer on the phone, so it answers
// the questions asked in that order: when, who, what, where, how much, what has
// happened so far. The audit trail (job timings, photos, payments) sits at the
// bottom because it is what you scroll to when the answer is disputed.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardTitle,
  Field,
  LinkButton,
  PageHeader,
  StatusBadge,
} from '@/components/ui';
import AppointmentActions from '@/components/admin/AppointmentActions';
import { mapsHref, telHref } from '@/components/staff/JobCard';
import { requireRolePage } from '@/lib/guards';
import { getAppointmentView } from '@/lib/repo/appointments';
import { getJobByAppointment, listJobPhotos } from '@/lib/repo/jobs';
import { listPayments, paidForAppointment } from '@/lib/repo/payments';
import { listUsers } from '@/lib/repo/users';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { STAFF_ROLES } from '@/lib/models';
import { formatDateTime, relativeTime, toLocalParts } from '@/lib/timezone';
import { formatCurrency, formatHours } from '@/lib/pricing';
import { getAddOn, getService } from '@/data/pricing';

export const dynamic = 'force-dynamic';

export default async function AdminAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRolePage('manager', `/admin/appointments/${(await params).id}`);
  const { timezone } = getSchedulingConfig();

  const appointment = getAppointmentView((await params).id);
  if (!appointment) notFound();

  // Read-only here: `jobFor()` would CREATE a job row as a side effect of
  // someone merely looking at a cancelled booking. A manager opening a page
  // should not write to the database.
  const job = getJobByAppointment(appointment.id);
  const photos = job ? listJobPhotos(job.id) : [];
  const payments = listPayments({ appointmentId: appointment.id });
  const paid = paidForAppointment(appointment.id);

  const technicians = listUsers({ roles: STAFF_ROLES, activeOnly: true, limit: 200 });

  // datetime-local wants 'YYYY-MM-DDTHH:mm' with no zone, expressed in the
  // BUSINESS's timezone rather than the server's.
  const local = toLocalParts(new Date(appointment.startsAt), timezone);
  const startsAtLocalValue = `${local.dateIso}T${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;

  const balanceDue = Math.max(0, Math.round(appointment.quotedTotal * 100) - paid);

  return (
    <>
      <PageHeader
        eyebrow={appointment.reference}
        title={appointment.customerName}
        description={`${formatDateTime(appointment.startsAt, timezone)} · ${relativeTime(appointment.startsAt)}`}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/admin/customers/${appointment.customerId}`} variant="secondary" size="sm">
              Customer
            </LinkButton>
            <LinkButton href="/admin/schedule" variant="ghost" size="sm">
              ← Schedule
            </LinkButton>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardTitle action={<StatusBadge status={appointment.status} />}>Booking</CardTitle>
            <dl>
              <Field label="Starts">{formatDateTime(appointment.startsAt, timezone)}</Field>
              <Field label="Ends">{formatDateTime(appointment.endsAt, timezone)}</Field>
              <Field label="Allowed">{formatHours(appointment.estimatedHours)}</Field>
              <Field label="Travel + buffer">
                {appointment.travelMinutes} + {appointment.bufferMinutes} min
              </Field>
              <Field label="Technician">{appointment.employeeName ?? 'Unassigned'}</Field>
              <Field label="Vehicle">{appointment.vehicleLabel ?? 'Not recorded'}</Field>
              <Field label="Where">
                {appointment.address ? (
                  <a
                    href={mapsHref(appointment.address)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline decoration-white/20 underline-offset-4 hover:text-flare"
                  >
                    {appointment.address}
                  </a>
                ) : (
                  'At the shop'
                )}
              </Field>
              <Field label="Source">{appointment.source}</Field>
              <Field label="Booked">{formatDateTime(appointment.createdAt, timezone)}</Field>
              {appointment.cancelledAt && (
                <Field label="Cancelled">
                  {formatDateTime(appointment.cancelledAt, timezone)}
                  {appointment.cancelReason ? ` — ${appointment.cancelReason}` : ''}
                </Field>
              )}
            </dl>

            <div className="mt-4 space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">Sold</p>
              <ul className="flex flex-wrap gap-1.5">
                {appointment.serviceIds.map((id) => (
                  <li key={id}>
                    <Badge>{getService(id)?.name ?? id}</Badge>
                  </li>
                ))}
                {appointment.addOnIds.map((id) => (
                  <li key={id}>
                    <Badge tone="info">{getAddOn(id)?.name ?? id}</Badge>
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

          {/* ── Job record ── */}
          <Card>
            <CardTitle
              action={
                job ? (
                  <Link
                    href={`/staff/jobs/${job.id}`}
                    className="font-mono text-[11px] uppercase tracking-widest2 text-muted hover:text-white"
                  >
                    Open runner
                  </Link>
                ) : undefined
              }
            >
              Job record
            </CardTitle>

            {!job ? (
              <p className="py-3 text-[13px] text-subtle">
                No job has been created yet. One appears when a technician is assigned, or when
                staff first open the runner.
              </p>
            ) : (
              <>
                <dl>
                  <Field label="Status">
                    <StatusBadge status={job.status} />
                  </Field>
                  <Field label="Started">
                    {job.startedAt ? formatDateTime(job.startedAt, timezone) : 'Not started'}
                  </Field>
                  <Field label="Completed">
                    {job.completedAt ? formatDateTime(job.completedAt, timezone) : '—'}
                  </Field>
                  <Field label="Worked">
                    {job.durationMinutes === null ? '—' : `${job.durationMinutes} min`}
                  </Field>
                  <Field label="Checklist">
                    {job.checklist.filter((i) => i.done).length} / {job.checklist.length}
                  </Field>
                  <Field label="Materials">
                    {job.materials.length
                      ? formatCurrency(
                          job.materials.reduce((s, m) => s + m.costCents * m.qty, 0) / 100
                        )
                      : 'None recorded'}
                  </Field>
                  <Field label="Signed by">{job.signedBy || 'Not signed'}</Field>
                  <Field label="Rating">
                    {job.customerRating ? `${job.customerRating} / 5` : 'Not rated'}
                  </Field>
                </dl>

                {job.completionNotes && (
                  <p className="mt-4 whitespace-pre-line rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] leading-relaxed text-muted">
                    {job.completionNotes}
                  </p>
                )}

                {photos.length > 0 && (
                  <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {photos.map((p) => (
                      <li key={p.id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.caption || `${p.kind} photo`}
                          className="aspect-square w-full rounded-sm object-cover"
                          loading="lazy"
                        />
                        <span className="absolute left-1 top-1">
                          <Badge tone={p.kind === 'after' ? 'positive' : 'neutral'}>{p.kind}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
        </div>

        {/* ── Sidebar ── */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardTitle>Actions</CardTitle>
            <AppointmentActions
              appointmentId={appointment.id}
              employeeId={appointment.employeeId}
              status={appointment.status}
              technicians={technicians.map((t) => ({ id: t.id, name: t.name }))}
              full
              startsAtLocalValue={startsAtLocalValue}
            />
          </Card>

          <Card>
            <CardTitle>Contact</CardTitle>
            <dl>
              <Field label="Email">
                <a
                  href={`mailto:${appointment.customerEmail}`}
                  className="underline decoration-white/20 underline-offset-4 hover:text-flare"
                >
                  {appointment.customerEmail}
                </a>
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
            </dl>
          </Card>

          <Card>
            <CardTitle>Money</CardTitle>
            <dl>
              <Field label="Quoted">
                {appointment.quotedTotalMax > appointment.quotedTotal
                  ? `${formatCurrency(appointment.quotedTotal)} – ${formatCurrency(appointment.quotedTotalMax)}`
                  : formatCurrency(appointment.quotedTotal)}
              </Field>
              <Field label="Deposit">{formatCurrency(appointment.depositCents / 100)}</Field>
              <Field label="Collected">{formatCurrency(paid / 100)}</Field>
              <Field label="Balance">{formatCurrency(balanceDue / 100)}</Field>
            </dl>

            {payments.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="text-muted">
                      {p.kind} · {p.provider}
                    </span>
                    <span className="font-mono text-white">
                      {formatCurrency(p.amountCents / 100)}{' '}
                      <span className="text-subtle">{p.status}</span>
                    </span>
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

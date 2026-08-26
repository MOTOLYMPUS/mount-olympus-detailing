// ─────────────────────────────────────────────────────────────────────────────
// One assigned job, as a technician needs to see it on a phone in a driveway.
//
// A SERVER component — nothing here has state. The two "actions" that look
// interactive are plain anchors:
//   • tel:  — hands off to the dialler, works offline, no JS.
//   • maps  — a plain https://maps.google.com/?q= link rather than a native
//             geo: URI, because geo: silently does nothing on desktop and on
//             several Android browsers, and a technician checking tomorrow's
//             route on a laptop is a real case.
//
// The address is percent-encoded on the way into the query string; an address
// containing '&' or '#' would otherwise truncate the search.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Badge, Card, StatusBadge, buttonClass } from '@/components/ui';
import { AppointmentView, Job } from '@/lib/models';
import { formatTime } from '@/lib/timezone';
import { formatCurrency } from '@/lib/pricing';
import { getService } from '@/data/pricing';
import { canManage } from '@/lib/rbac';
import { Role } from '@/lib/models';

export function serviceNames(serviceIds: string[]): string[] {
  // Fall back to the raw id rather than dropping it: an id with no catalogue
  // entry means the service was retired, and the technician still has to know
  // it was sold.
  return serviceIds.map((id) => getService(id)?.name ?? id);
}

export function mapsHref(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

/** Digits only — a dialler chokes on "(555) 010-2030 ext. 4". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export default function JobCard({
  appointment,
  job,
  timezone,
  role,
  showDate,
}: {
  appointment: AppointmentView;
  job: Job | null;
  timezone: string;
  role: Role;
  showDate?: string;
}) {
  const services = serviceNames(appointment.serviceIds);
  const address = appointment.address.trim();

  // The primary action follows the job's state so the technician never has to
  // decide which button is the right one: there is only ever one obvious next
  // step, and it is the biggest thing on the card.
  const primaryLabel =
    job?.status === 'in_progress'
      ? 'Continue job'
      : job?.status === 'paused'
        ? 'Resume job'
        : job?.status === 'completed'
          ? 'View job'
          : 'Start job';

  return (
    <Card as="li" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
            {showDate ? `${showDate} · ` : ''}
            {formatTime(appointment.startsAt, timezone)} – {formatTime(appointment.endsAt, timezone)}
          </p>
          <p className="mt-1 truncate font-display text-lg font-semibold text-white">
            {appointment.customerName}
          </p>
          {appointment.vehicleLabel && (
            <p className="text-sm text-muted">{appointment.vehicleLabel}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={job?.status ?? appointment.status} />
          {canManage(role) && (
            <span className="font-mono text-[12px] text-muted">
              {formatCurrency(appointment.quotedTotal)}
            </span>
          )}
        </div>
      </div>

      {!!services.length && (
        <ul className="flex flex-wrap gap-1.5">
          {services.map((name) => (
            <li key={name}>
              <Badge>{name}</Badge>
            </li>
          ))}
        </ul>
      )}

      {(address || appointment.customerPhone) && (
        <dl className="space-y-1.5 text-sm">
          {address && (
            <div className="flex gap-2">
              <dt className="sr-only">Address</dt>
              <dd className="min-w-0">
                <a
                  href={mapsHref(address)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted underline decoration-white/20 underline-offset-4 hover:text-white"
                >
                  {address}
                </a>
                <span className="ml-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                  {appointment.locationType === 'shop' ? 'Shop' : 'Mobile'}
                </span>
              </dd>
            </div>
          )}
          {appointment.customerPhone && (
            <div>
              <dt className="sr-only">Phone</dt>
              <dd>
                <a
                  href={telHref(appointment.customerPhone)}
                  className="font-mono text-[13px] text-muted underline decoration-white/20 underline-offset-4 hover:text-white"
                >
                  {appointment.customerPhone}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}

      {appointment.notes && (
        <p className="whitespace-pre-line rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] leading-relaxed text-muted">
          {appointment.notes}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {job ? (
          <Link href={`/staff/jobs/${job.id}`} className={buttonClass('primary', 'sm')}>
            {primaryLabel}
          </Link>
        ) : (
          <span className="text-[13px] text-subtle">No job record yet.</span>
        )}
        {canManage(role) && (
          <Link
            href={`/admin/appointments/${appointment.id}`}
            className={buttonClass('secondary', 'sm')}
          >
            Booking detail
          </Link>
        )}
      </div>
    </Card>
  );
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePage } from '@/lib/guards';
import { getAppointmentView } from '@/lib/repo/appointments';
import { getJobByAppointment, listJobPhotos } from '@/lib/repo/jobs';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { canViewAppointment } from '@/lib/rbac';
import { withinCancellationWindow } from '@/lib/availability';
import { formatDateTime, formatDuration, relativeTime } from '@/lib/timezone';
import { formatPrice } from '@/lib/pricing';
import { getAddOn, getService } from '@/data/pricing';
import { sizeLabel } from '@/lib/industries';
import { business } from '@/lib/business';
import ManageBooking from '@/components/booking/ManageBooking';
import RateJob from '@/components/booking/RateJob';
import { Alert, Card, CardTitle, Field, PageHeader, StatusBadge } from '@/components/ui';
import Reveal from '@/components/visual/Reveal';

export const dynamic = 'force-dynamic';

export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await requirePage(`/app/appointments/${(await params).id}`);
  const appointment = getAppointmentView((await params).id);

  if (!appointment || !canViewAppointment(user, appointment)) notFound();

  const config = getSchedulingConfig();
  const job = getJobByAppointment(appointment.id);
  const photos = job ? listJobPhotos(job.id) : [];

  const before = photos.filter((p) => p.kind === 'before');
  const after = photos.filter((p) => p.kind === 'after');
  const progress = photos.filter((p) => p.kind === 'progress');

  const services = appointment.serviceIds.map((id) => getService(id)).filter(Boolean);
  const addOns = appointment.addOnIds.map((id) => getAddOn(id)).filter(Boolean);

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        eyebrow={`Reference ${appointment.reference}`}
        title={formatDateTime(appointment.startsAt, config.timezone)}
        description={relativeTime(appointment.startsAt)}
        action={<StatusBadge status={appointment.status} />}
      />

      {(await searchParams).new === '1' && (
        <Alert tone="positive" title="You are booked in">
          A confirmation is on its way to your email. We will send a reminder before the day.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Booking</CardTitle>
          <dl>
            <Field label="Vehicle">
              {appointment.vehicleLabel ?? '—'}
              <span className="block text-[12px] text-subtle">{sizeLabel(appointment.sizeClass)}</span>
            </Field>
            <Field label="Where">
              {appointment.locationType === 'mobile' ? appointment.address || 'Your location' : 'Our shop'}
            </Field>
            <Field label="Finishes">{formatDateTime(appointment.endsAt, config.timezone)}</Field>
            {appointment.employeeName && <Field label="Technician">{appointment.employeeName}</Field>}
            {appointment.notes && <Field label="Your notes">{appointment.notes}</Field>}
          </dl>
        </Card>

        <Card>
          <CardTitle>What we are doing</CardTitle>
          <ul className="space-y-2.5 text-sm">
            {services.map((s) => (
              <li key={s!.id}>
                <p className="text-white">{s!.name}</p>
                {s!.includes?.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {s!.includes.map((inc) => (
                      <li key={inc} className="text-[12px] text-subtle">
                        · {inc}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {addOns.map((a) => (
              <li key={a!.id} className="text-muted">
                + {a!.name}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-4">
            <span className="text-sm text-white">Estimated total</span>
            <span className="font-display text-xl font-bold text-white">
              {formatPrice(appointment.quotedTotal, appointment.quotedTotalMax)}
            </span>
          </div>
          {appointment.paidCents > 0 && (
            <p className="mt-1 text-right text-[12px] text-emerald-400">
              {(appointment.paidCents / 100).toFixed(2)} paid
            </p>
          )}
        </Card>
      </div>

      {/* ── Photos ─────────────────────────────────────────────────────────────
          These stay a plain <img>. They are customer uploads served from
          /api/files, which next/image cannot optimise without a custom loader
          — and because there is no srcset, a `sizes` attribute here would be
          inert markup rather than a hint the browser can act on. `aspect-square`
          is what actually reserves the box and prevents the grid collapsing to
          zero height before the images decode.

          Each group is wrapped in <Reveal>, which flips `data-revealed` on the
          wrapper; the `.img-reveal` clip-path wipe below keys off that. The
          wipe runs over an already-decoded image, so it never flashes an empty
          frame and cannot shift layout. */}
      {photos.length > 0 && (
        <section aria-labelledby="photos">
          <h2 id="photos" className="eyebrow mb-3">
            Photos
          </h2>
          <div className="space-y-5">
            {[
              { label: 'Before', items: before },
              { label: 'During', items: progress },
              { label: 'After', items: after },
            ]
              .filter((g) => g.items.length)
              .map((group, groupIndex) => (
                <Reveal key={group.label} delay={groupIndex * 80}>
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                    {group.label}
                  </p>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {group.items.map((p) => (
                      <li
                        key={p.id}
                        className="lift overflow-hidden rounded-sm border border-white/10"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt={p.caption || `${group.label} photo`}
                          loading="lazy"
                          decoding="async"
                          className="img-reveal aspect-square w-full object-cover"
                        />
                      </li>
                    ))}
                  </ul>
                </Reveal>
              ))}
          </div>
        </section>
      )}

      {/* ── Work record ────────────────────────────────────────────────────── */}
      {job?.status === 'completed' && (
        <Card>
          <CardTitle>Work completed</CardTitle>
          <dl>
            {job.durationMinutes !== null && (
              <Field label="Time on site">{formatDuration(job.durationMinutes)}</Field>
            )}
            {job.completedAt && (
              <Field label="Finished">{formatDateTime(job.completedAt, config.timezone)}</Field>
            )}
          </dl>

          {job.completionNotes && (
            <p className="mt-4 rounded-sm bg-white/5 px-4 py-3 text-[13px] leading-relaxed text-muted">
              {job.completionNotes}
            </p>
          )}

          {job.checklist.length > 0 && (
            <ul className="mt-4 space-y-1">
              {job.checklist.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[13px]">
                  <span className={c.done ? 'text-emerald-400' : 'text-subtle'} aria-hidden="true">
                    {c.done ? '✓' : '○'}
                  </span>
                  <span className={c.done ? 'text-muted' : 'text-subtle line-through'}>{c.label}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-white/10 pt-5">
            <RateJob
              appointmentId={appointment.id}
              jobId={job.id}
              currentRating={job.customerRating}
              currentFeedback={job.customerFeedback}
            />
          </div>
        </Card>
      )}

      {/* ── Manage ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Manage</CardTitle>
        <ManageBooking
          appointmentId={appointment.id}
          startsAt={appointment.startsAt}
          status={appointment.status}
          canChange={withinCancellationWindow(appointment.startsAt)}
          noticeHours={config.cancellationNoticeHours}
        />

        {appointment.status === 'cancelled' && (
          <Alert tone="danger" title="This booking was cancelled">
            {appointment.cancelReason || 'No reason recorded.'}{' '}
            <Link href="/app/book" className="underline">
              Book again
            </Link>
          </Alert>
        )}

        <p className="mt-5 text-[12px] text-subtle">
          Anything else, call or text{' '}
          <a href={business.phoneHref} className="text-muted hover:text-white">
            {business.phone}
          </a>
          .
        </p>
      </Card>
    </div>
  );
}

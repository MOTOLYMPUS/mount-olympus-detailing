// ─────────────────────────────────────────────────────────────────────────────
// POST /api/jobs/:id/status — { action: 'start' | 'pause' | 'resume' | 'complete' }
//
// WHY A SEPARATE ROUTE from PATCH /api/jobs/:id: a state transition is not a
// field edit. It has side effects (the appointment closes, loyalty points are
// awarded, the customer is emailed) and it must be replay-safe. Keeping it on
// its own verb+path means a checklist save can never accidentally complete a
// job because a stray key was present in the body.
//
// THE TIMER lives entirely in the database — started_at plus the paused_ms
// accumulator (see lib/repo/jobs.ts). The client renders a clock derived from
// those two values, so a refresh, a dead battery, or a server restart cannot
// lose or inflate the recorded duration.
//
// SIGNATURES are written to disk via storeSignature() and only the resulting
// /api/files/… URL is stored. A raw base64 data URL in the column would bloat
// every row that reads the job and end up in logs and audit meta.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, fail, ok, str, text, withAuth } from '@/lib/api';
import { completeJob, getJob, pauseJob, resumeJob, startJob } from '@/lib/repo/jobs';
import { getAppointment } from '@/lib/repo/appointments';
import { completeBooking } from '@/lib/booking';
import { canViewJob } from '@/lib/rbac';
import { UploadError, storeSignature } from '@/lib/uploads';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = ['start', 'pause', 'resume', 'complete'] as const;
type Action = (typeof ACTIONS)[number];

export const POST = withAuth('staff', async ({ user, params, body, ipHash }) => {
  const job = getJob(params.id);
  if (!job) return fail('Job not found.', 404);
  if (!canViewJob(user, job)) return fail('Job not found.', 404);

  const b = (body ?? {}) as Record<string, unknown>;
  const action = str(b.action, 20) as Action;
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return fail('Unknown action.', 400);
  }

  if (job.status === 'completed') {
    return fail('That job is already closed.', 409);
  }

  if (action === 'start') {
    const updated = startJob(job.id);
    audit({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT.JOB_START,
      entity: 'job',
      entityId: job.id,
      ipHash,
    });
    return ok({ job: updated });
  }

  if (action === 'pause') return ok({ job: pauseJob(job.id) });
  if (action === 'resume') return ok({ job: resumeJob(job.id) });

  // ── Complete ───────────────────────────────────────────────────────────────

  // The signature is optional: a mobile job where the customer is not present
  // still has to be closeable, and refusing would only teach technicians to
  // sign on the customer's behalf.
  let signatureUrl: string | null = null;
  const rawSignature = typeof b.signatureData === 'string' ? b.signatureData.trim() : '';
  if (rawSignature) {
    try {
      signatureUrl = (await storeSignature(rawSignature)).url;
    } catch (e) {
      if (e instanceof UploadError) return fail(e.message, e.status);
      throw e;
    }
  }

  const appointment = getAppointment(job.appointmentId);

  const completed = completeJob(job.id, {
    completionNotes: typeof b.completionNotes === 'string' ? text(b.completionNotes, 4000) : undefined,
    signatureData: signatureUrl,
    signedBy: str(b.signedBy, 120) || undefined,
    // Snapshot the money onto the job. The appointment's quote can be edited
    // later; what this technician actually earned the business on this day
    // must not move retroactively.
    revenueCents: appointment ? Math.round(appointment.quotedTotal * 100) : undefined,
  });

  // Closing the appointment is the part the customer sees. It is done through
  // lib/booking.ts rather than a status write so loyalty points and the
  // "your vehicle is ready" email cannot be skipped by closing from here.
  if (appointment) {
    try {
      await completeBooking(appointment.id, user);
    } catch (e) {
      // The job row is already closed; a failure to close the booking must be
      // visible rather than silently leaving the two records disagreeing.
      if (e instanceof ApiError) return fail(e.message, e.status, e.fields);
      throw e;
    }
  }

  return ok({ job: completed });
});

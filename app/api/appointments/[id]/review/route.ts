// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/appointments/:id/review — the customer's review of this booking
// POST /api/appointments/:id/review — write or replace it
//
// Only the customer the booking belongs to, and only once the job is completed
// AND paid (lib/invoicing.appointmentSettled). Photos are the customer's own
// uploads in the 'reviews' scope — validated to be OUR storage paths, exactly
// as job photos are, so a review cannot embed an off-site image.
//
// The rating and comment are mirrored onto the job record so the existing
// satisfaction reports (and the admin screens that read job.customerRating)
// keep working without a second query.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, int, ok, text, withAuth } from '@/lib/api';
import { appointmentSettled } from '@/lib/invoicing';
import { jobFor } from '@/lib/booking';
import { getAppointment } from '@/lib/repo/appointments';
import { updateJob } from '@/lib/repo/jobs';
import { getReviewForAppointment, upsertReview } from '@/lib/repo/reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PHOTOS = 6;
/** Matches what lib/uploads.ts `store()` returns for the reviews scope. */
const STORED_URL = /^\/api\/files\/reviews\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/;

export const GET = withAuth('any', async ({ user, params }) => {
  const appointment = getAppointment(params.id);
  if (!appointment || appointment.customerId !== user.id) return fail('Booking not found.', 404);
  return NextResponse.json({ ok: true, review: getReviewForAppointment(appointment.id) });
});

export const POST = withAuth(
  'any',
  async ({ user, params, body }) => {
    const appointment = getAppointment(params.id);
    if (!appointment || appointment.customerId !== user.id) return fail('Booking not found.', 404);

    if (appointment.status !== 'completed') {
      return fail('You can review this booking once the work is complete.', 409);
    }
    if (!appointmentSettled(appointment)) {
      return fail('You can leave a review once the invoice is paid.', 409);
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const rating = int(b.rating, 0);
    if (rating < 1 || rating > 5) return fail('Please choose 1 to 5 stars.', 400, { rating: 'Required.' });

    const comment = text(b.comment, 2000);

    const raw = Array.isArray(b.photoUrls) ? b.photoUrls : [];
    const photoUrls: string[] = [];
    for (const u of raw.slice(0, MAX_PHOTOS)) {
      if (typeof u !== 'string' || !STORED_URL.test(u)) {
        return fail('One of those photos has not been uploaded yet.', 400);
      }
      photoUrls.push(u);
    }

    const review = upsertReview({
      appointmentId: appointment.id,
      userId: user.id,
      rating,
      comment,
      photoUrls,
    });

    // Mirror onto the job so admin screens and reports see it.
    const job = jobFor(appointment);
    updateJob(job.id, { customerRating: rating, customerFeedback: comment });

    return ok({ review }, { status: 201 });
  },
  { limit: 'api' }
);

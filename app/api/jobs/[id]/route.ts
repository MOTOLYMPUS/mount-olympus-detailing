// ─────────────────────────────────────────────────────────────────────────────
// GET   /api/jobs/:id  — the job, its appointment, and its photos
// PATCH /api/jobs/:id  — checklist ticks, materials used, notes, rating
//
// AUTHORISATION: `canViewJob` is the ONLY gate, and it is applied to the loaded
// row rather than to the role. An employee carries the 'employee' role for
// every job in the database; only `job.employeeId === user.id` makes it theirs.
// Managers and above pass unconditionally because they have to be able to fix a
// technician's mistake after the fact.
//
// A missing job and a forbidden job both return 404. A 403 would confirm that
// the id exists, which is a free enumeration oracle over the whole job table.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, int, ok, str, text, withAuth } from '@/lib/api';
import { getJob, listJobPhotos, updateJob } from '@/lib/repo/jobs';
import { getAppointmentView } from '@/lib/repo/appointments';
import { canViewJob } from '@/lib/rbac';
import { ChecklistItem, MaterialUse } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rebuild the checklist from scratch rather than trusting the posted objects.
 * The client owns the tick state; it does not get to invent labels, because the
 * checklist is the record of what work was agreed and completed.
 */
function sanitiseChecklist(raw: unknown): ChecklistItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, 200).map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      id: str(o.id, 80),
      label: str(o.label, 200),
      done: o.done === true,
    };
  });
}

function sanitiseMaterials(raw: unknown): MaterialUse[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .slice(0, 100)
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        name: str(o.name, 120),
        // Quantities are clamped, not rejected: a fat-fingered "9999999" should
        // become a sane number rather than fail the whole save and lose the
        // technician's other edits.
        qty: Math.min(9999, Math.max(0, Number(o.qty) || 0)),
        unit: str(o.unit, 20),
        costCents: Math.min(10_000_00, Math.max(0, int(o.costCents, 0))),
      };
    })
    .filter((m) => m.name.length > 0);
}

export const GET = withAuth('staff', async ({ user, params }) => {
  const job = getJob(params.id);
  if (!job) return fail('Job not found.', 404);
  if (!canViewJob(user, job)) return fail('Job not found.', 404);

  const appointment = getAppointmentView(job.appointmentId);
  const photos = listJobPhotos(job.id);

  return NextResponse.json({ ok: true, job, appointment, photos });
});

export const PATCH = withAuth('staff', async ({ user, params, body }) => {
  const job = getJob(params.id);
  if (!job) return fail('Job not found.', 404);
  if (!canViewJob(user, job)) return fail('Job not found.', 404);

  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Parameters<typeof updateJob>[1] = {};

  const checklist = sanitiseChecklist(b.checklist);
  if (checklist) patch.checklist = checklist;

  const materials = sanitiseMaterials(b.materials);
  if (materials) patch.materials = materials;

  if (typeof b.completionNotes === 'string') {
    patch.completionNotes = text(b.completionNotes, 4000);
  }

  // The rating is captured by the technician at handover ("how did we do?"), so
  // it is written through the staff route. `updateJob` clamps it to 1–5.
  if (b.customerRating !== undefined) {
    const rating = int(b.customerRating, 0);
    if (rating < 1 || rating > 5) return fail('A rating must be between 1 and 5.', 400);
    patch.customerRating = rating;
  }
  if (typeof b.customerFeedback === 'string') {
    patch.customerFeedback = text(b.customerFeedback, 2000);
  }

  if (!Object.keys(patch).length) return fail('Nothing to update.', 400);

  const updated = updateJob(job.id, patch);
  return ok({ job: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST   /api/jobs/:id/photos            — attach an already-uploaded image
// DELETE /api/jobs/:id/photos?photo=<id> — detach one
//
// TWO-STEP UPLOAD: the bytes go to /api/uploads (scope 'jobs'), which sniffs
// the magic bytes and generates the filename; this route only ever records a
// URL. That split means the dangerous part lives in exactly one audited place.
//
// The URL is therefore validated to be one of OUR storage paths. Accepting an
// arbitrary string would let a technician point a "before" photo at any remote
// host — which the customer's browser would then fetch, leaking their IP and
// making our job record depend on somebody else's server staying up.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, str, withAuth } from '@/lib/api';
import { addJobPhoto, deleteJobPhoto, getJob, listJobPhotos } from '@/lib/repo/jobs';
import { canViewJob } from '@/lib/rbac';
import { PhotoKind } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: PhotoKind[] = ['before', 'after', 'progress'];

/** Matches exactly what lib/uploads.ts `store()` returns for the jobs scope. */
const STORED_URL = /^\/api\/files\/jobs\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/;

export const POST = withAuth('staff', async ({ user, params, body }) => {
  const job = getJob(params.id);
  if (!job) return fail('Job not found.', 404);
  if (!canViewJob(user, job)) return fail('Job not found.', 404);

  const b = (body ?? {}) as Record<string, unknown>;

  const kind = str(b.kind, 20) as PhotoKind;
  if (!KINDS.includes(kind)) return fail('Photos must be before, after, or progress.', 400);

  const url = str(b.url, 300);
  if (!STORED_URL.test(url)) return fail('That photo has not been uploaded yet.', 400);

  // A soft cap: a job with 200 photos is a bug or an accident, and every one of
  // them is rendered on the customer's appointment page.
  if (listJobPhotos(job.id).length >= 60) {
    return fail('This job already has the maximum number of photos.', 409);
  }

  const photo = addJobPhoto({
    jobId: job.id,
    kind,
    url,
    caption: str(b.caption, 200),
    uploadedBy: user.id,
  });

  return ok({ photo }, { status: 201 });
});

export const DELETE = withAuth('staff', async ({ user, params, query }) => {
  const job = getJob(params.id);
  if (!job) return fail('Job not found.', 404);
  if (!canViewJob(user, job)) return fail('Job not found.', 404);

  const photoId = str(query.get('photo'), 60);
  if (!photoId) return fail('Which photo?', 400);

  // Confirm the photo belongs to THIS job before deleting. Without it, anyone
  // holding one job of their own could delete any photo in the system by id.
  const photo = listJobPhotos(job.id).find((p) => p.id === photoId);
  if (!photo) return fail('Photo not found.', 404);

  deleteJobPhoto(photo.id);

  // NOTE: the file itself is intentionally left on disk. Deleting it here would
  // orphan any other record that references the same URL, and an unreferenced
  // image is cheap. A sweeper job is the right cleanup, not this handler.
  return ok({ deleted: photo.id });
});

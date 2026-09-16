// ─────────────────────────────────────────────────────────────────────────────
// POST /api/uploads — multipart image upload.
//
// `rawBody: true` because withAuth's JSON parser must not consume a multipart
// stream; the handler reads formData() itself. Everything dangerous about the
// file is handled in lib/uploads.ts — see the threat model there.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, withAuth } from '@/lib/api';
import { UploadError, UploadScope, store } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED: UploadScope[] = ['jobs', 'vehicles', 'messages', 'avatars', 'reviews'];

export const POST = withAuth(
  'any',
  async ({ req, user }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail('Could not read the upload.', 400);
    }

    const scope = String(form.get('scope') ?? 'jobs') as UploadScope;
    if (!ALLOWED.includes(scope)) return fail('Unknown upload type.', 400);

    // Only staff may attach photos to a job record; customers upload to their
    // own vehicles and to booking notes.
    if (scope === 'jobs' && user.role === 'customer') {
      return fail('You do not have access to that.', 403);
    }

    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (!files.length) return fail('No file was attached.', 400);
    if (files.length > 10) return fail('Please upload no more than 10 files at once.', 400);

    try {
      const stored = await Promise.all(files.map((f) => store(f, scope)));
      return ok({ files: stored }, { status: 201 });
    } catch (e) {
      if (e instanceof UploadError) return fail(e.message, e.status);
      console.error('[uploads] failed', e);
      return fail('That upload failed. Please try again.', 500);
    }
  },
  { limit: 'upload', rawBody: true }
);

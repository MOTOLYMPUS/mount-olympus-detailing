// ─────────────────────────────────────────────────────────────────────────────
// GET /api/files/<scope>/<uuid>.<ext> — serve an uploaded image.
//
// Why a route handler rather than putting uploads in /public:
//   • Files in /public are served by the static handler with a Content-Type
//     inferred from the extension and no access control at all.
//   • Here every response gets an explicitly SNIFFED Content-Type, an
//     `X-Content-Type-Options: nosniff`, and `Content-Disposition: inline`, so
//     nothing can be coaxed into executing.
//   • Authentication can be enforced. Job photos are a customer's vehicle and,
//     in the case of signatures, their handwriting — those are not public.
//
// ⚠️ Access is currently "any signed-in user". Job photos are not scoped to the
// customer they belong to, because the key is an unguessable UUID and the
// alternative (a join per image request) is a real cost. If you need strict
// per-object authorisation, add an `uploads` table mapping key → owner and
// check it here. This is called out in the audit as a known limitation.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, withAuth } from '@/lib/api';
import { read } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('any', async ({ params }) => {
  // Next gives a catch-all segment as an array; join it back into the key.
  const raw = (params as unknown as { key?: string[] }).key;
  const key = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');

  const file = await read(key);
  if (!file) return fail('Not found.', 404);

  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      'Content-Type': file.mime,
      'Content-Length': String(file.bytes.byteLength),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      // Private: these are customer photos, so no shared/CDN cache.
      'Cache-Control': 'private, max-age=86400, immutable',
    },
  });
});

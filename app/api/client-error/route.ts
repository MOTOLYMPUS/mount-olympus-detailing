// ─────────────────────────────────────────────────────────────────────────────
// POST /api/client-error — browser error beacon.
//
// The inline script in app/layout.tsx posts uncaught errors here so a failure
// on a device with no developer tools (an old iPad, a customer's phone) can be
// read from the server log. No auth: the page may have crashed before any
// session code ran. Defences instead: strict size caps, a fixed shape, an
// IP rate limit, and the payload is only ever LOGGED — never stored or shown.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { consume } from '@/lib/ratelimit';
import { clientIp, hashIp } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

export async function POST(req: NextRequest) {
  const limit = consume('api', hashIp(clientIp(req.headers)) ?? 'anonymous');
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length > 4000) return NextResponse.json({ ok: false }, { status: 413 });
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  console.error(
    '[client-error]',
    JSON.stringify({
      message: cut(body.message, 300),
      source: cut(body.source, 200),
      line: Number(body.line) || 0,
      col: Number(body.col) || 0,
      stack: cut(body.stack, 600),
      url: cut(body.url, 200),
      ua: cut(req.headers.get('user-agent'), 200),
    })
  );

  return NextResponse.json({ ok: true });
}

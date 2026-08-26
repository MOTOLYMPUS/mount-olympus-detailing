// ─────────────────────────────────────────────────────────────────────────────
// POST /api/jarvis/tick — run the orchestrator once.
//
// Same design as app/api/cron/reminders: no in-process scheduler, just an
// idempotent endpoint an external scheduler pokes. Every fifteen minutes is a
// sensible cadence.
//
//   Windows Task Scheduler / cron:
//     curl -X POST http://localhost:3000/api/jarvis/tick \
//          -H "Authorization: Bearer $JARVIS_CRON_SECRET"
//
// TWO WAYS IN, deliberately:
//   • a bearer secret, for the scheduler, which has no session;
//   • an admin session, so the owner can press "Run now" in the dashboard
//     without knowing the secret.
//
// Unlike the reminders endpoint this does NOT fail closed when the secret is
// unset — an admin session is still honoured. A missing secret should mean
// "scheduled runs are not set up yet", not "the dashboard button is broken".
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSessionUser } from '@/lib/auth';
import { atLeast } from '@/lib/rbac';
import { cronSecret } from '@/lib/jarvis/config';
import { tick } from '@/lib/jarvis/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Agent runs make model calls; the default serverless timeout is not enough.
 * The tick has its own internal time budget as well, so it returns cleanly
 * rather than being killed mid-task.
 */
export const maxDuration = 300;

function hasSecret(req: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;

  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hasAdminSession(): boolean {
  try {
    const user = getSessionUser();
    return !!user && atLeast(user.role, 'admin');
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!hasSecret(req) && !hasAdminSession()) {
    return NextResponse.json({ ok: false, error: 'Not authorised.' }, { status: 401 });
  }

  const result = await tick();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/reminders — send appointment reminders.
//
// There is no scheduler in this application, by design: adding one would mean
// adding a process to supervise. Instead this endpoint is idempotent and safe
// to call as often as you like, and you point any external scheduler at it —
// cron, a Vercel Cron job, GitHub Actions, or Task Scheduler on Windows:
//
//   curl -X POST https://your-domain/api/cron/reminders \
//        -H "Authorization: Bearer $CRON_SECRET"
//
// Idempotency comes from the `reminded_at` column: an appointment that has
// already been reminded is not selected again, so running this hourly sends
// exactly one reminder per booking.
//
// AUTHENTICATION is a shared secret rather than a session, because a scheduler
// has no user. If CRON_SECRET is unset the endpoint refuses every request —
// failing closed, so an unconfigured deployment cannot be used by a stranger
// to send mail on the owner's behalf.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { dueForReminder, updateAppointment } from '@/lib/repo/appointments';
import { getUser } from '@/lib/repo/users';
import { sendAppointmentReminder } from '@/lib/notify-account';
import { createNotification } from '@/lib/repo/notifications';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { formatDateTime } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How far ahead to look. A reminder the evening before is the useful one. */
const LOOKAHEAD_HOURS = 24;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided) return false;

  // Constant-time comparison. A plain `===` on a secret leaks its length and,
  // in principle, its content through timing.
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: 'Not authorised.' }, { status: 401 });
  }

  const config = getSchedulingConfig();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString();

  const due = dueForReminder(from, to);

  let sent = 0;
  let skipped = 0;

  for (const appointment of due) {
    const customer = getUser(appointment.customerId);
    if (!customer) {
      skipped++;
      continue;
    }

    // Stamp FIRST. If the mail provider is slow and the scheduler fires again
    // mid-flight, a second reminder is worse than a missing one — and the
    // in-app notification below is the durable record either way.
    updateAppointment(appointment.id, { remindedAt: new Date().toISOString() });

    createNotification({
      userId: customer.id,
      kind: 'appointment_reminder',
      title: 'Your detail is coming up',
      body: `${formatDateTime(appointment.startsAt, config.timezone)} · ${appointment.reference}`,
      url: `/app/appointments/${appointment.id}`,
    });

    try {
      await sendAppointmentReminder(customer, appointment);
      sent++;
    } catch (e) {
      console.error('[cron] reminder failed', appointment.reference, e);
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, considered: due.length, sent, skipped });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}

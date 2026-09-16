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
import { sendAppointmentReminder, sendAppointmentSoon } from '@/lib/notify-account';
import { notifyUser } from '@/lib/push';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { formatDateTime } from '@/lib/timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How far ahead to look. A reminder the evening before is the useful one. */
const LOOKAHEAD_HOURS = 24;

/**
 * Second, short-notice reminder: "see you in about 2½ hours". Its own stamp
 * (reminded_soon_at) so it fires exactly once regardless of the day-before
 * one. The scheduler must run at least every 30 minutes for this to land
 * close to the mark; with hourly runs it arrives 2–3 hours out.
 */
const SOON_HOURS = 2.5;

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

    // In-app bell + push (notifyUser never throws; push is best-effort).
    await notifyUser(customer.id, {
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

  // ── Short-notice pass: starts within the next 2½ hours ─────────────────────
  const soonTo = new Date(Date.now() + SOON_HOURS * 60 * 60 * 1000).toISOString();
  const dueSoon = dueForReminder(from, soonTo, 'soon');
  let soonSent = 0;

  for (const appointment of dueSoon) {
    const customer = getUser(appointment.customerId);
    if (!customer) continue;

    updateAppointment(appointment.id, { remindedSoonAt: new Date().toISOString() });

    await notifyUser(customer.id, {
      kind: 'appointment_soon',
      title: 'See you soon',
      body: `Your detail is at ${formatDateTime(appointment.startsAt, config.timezone)} · ${appointment.reference}`,
      url: `/app/appointments/${appointment.id}`,
    });

    try {
      await sendAppointmentSoon(customer, appointment);
      soonSent++;
    } catch (e) {
      console.error('[cron] short-notice reminder failed', appointment.reference, e);
    }
  }

  return NextResponse.json({
    ok: true,
    considered: due.length,
    sent,
    skipped,
    soon: { considered: dueSoon.length, sent: soonSent },
  });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}

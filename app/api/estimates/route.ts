// ─────────────────────────────────────────────────────────────────────────────
// POST /api/estimates — the one write path in the application.
//
// Order of operations matters:
//   1. Rate limit          — before any work, so abuse is cheap to reject
//   2. Validate            — reject malformed / hostile payloads
//   3. RECOMPUTE the price — the client's number is never read
//   4. Persist             — the submission is safe before anything else
//   5. Notify              — failures here are recorded, never fatal
//
// Step 3 is the security-critical one: a client that posts
// `{ quotedTotal: 1 }` gets the real price stored regardless.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { validateEstimateRequest } from '@/lib/validation';
import { calculateEstimate } from '@/lib/pricing';
import { countRecentByIp, insertEstimateRequest, updateNotificationStatus } from '@/lib/db';
import { getPriceOverrides } from '@/lib/repo/pricing';
import { sendEstimateNotifications } from '@/lib/notify';
import { assertBookable, durationForHours } from '@/lib/availability';
import { createAppointment } from '@/lib/repo/appointments';
import { createUser } from '@/lib/repo/users';
import { RATE_LIMIT, clientIp, generateReference, hashIp } from '@/lib/security';
import { EstimateRequestRecord } from '@/lib/types';

// SQLite + node:sqlite require the Node runtime, not Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // ── 1. Rate limit ─────────────────────────────────────────────────────────
  const ipHash = hashIp(clientIp(req.headers));
  if (ipHash) {
    const since = new Date(Date.now() - RATE_LIMIT.windowMs).toISOString();
    try {
      if (countRecentByIp(ipHash, since) >= RATE_LIMIT.max) {
        return NextResponse.json(
          {
            ok: false,
            errors: {
              _: 'Too many requests from this network. Please call us instead — we can help right away.',
            },
          },
          { status: 429 }
        );
      }
    } catch (e) {
      // A rate-limit read failure must not block a legitimate customer.
      console.error('[estimates] rate limit check failed', e);
    }
  }

  // ── 2. Validate ───────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, errors: { _: 'Invalid JSON.' } }, { status: 400 });
  }

  const result = validateEstimateRequest(body);
  if (!result.ok || !result.value) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }
  const input = result.value;

  // ── 3. Recompute price server-side ────────────────────────────────────────
  const estimate = calculateEstimate({
    industry: input.industry,
    size: input.sizeClass,
    serviceIds: input.serviceIds,
    addOnIds: input.addOnIds,
    // Authoritative: the price stored, quoted and emailed uses the owner's
    // admin overrides, never just the code defaults.
    overrides: getPriceOverrides(),
  });

  if (!estimate) {
    return NextResponse.json(
      { ok: false, errors: { serviceIds: 'Those services are not available for that size.' } },
      { status: 400 }
    );
  }

  const record: EstimateRequestRecord = {
    ...input,
    id: crypto.randomUUID(),
    reference: generateReference(),
    quotedTotal: estimate.total,
    quotedTotalMax: estimate.totalMax,
    estimatedHours: estimate.estimatedHours,
    isPlaceholderPricing: estimate.isPlaceholderPricing,
    createdAt: new Date().toISOString(),
    status: 'new',
  };

  // ── 4. Persist ────────────────────────────────────────────────────────────
  try {
    insertEstimateRequest(record, ipHash);
  } catch (e) {
    console.error('[estimates] insert failed', e);
    return NextResponse.json(
      {
        ok: false,
        errors: { _: 'We could not save your request. Please call us and we will take the details.' },
      },
      { status: 500 }
    );
  }

  // ── 4.5 Hold the requested slot ─────────────────────────────────────────────
  // If the customer picked a specific time, reserve it as a tentative, blocking
  // appointment (source 'estimate') so the NEXT visitor is not offered the same
  // slot. This is what makes the public calendar "update based on other
  // estimates". The owner sees it in /admin/schedule and confirms or releases it.
  //
  // Best-effort by design: a failure here — including the slot having just been
  // taken by someone faster — must never fail the estimate. The lead is already
  // saved, and the owner arranges timing directly in that case.
  //
  // The hold is attached to a per-lead PLACEHOLDER customer with a synthetic,
  // non-login email. Two reasons: (1) the appointments table needs a customer,
  // and (2) using the customer's REAL email here would later block them from
  // registering, since /api/auth/register rejects an existing address. The
  // placeholder carries the real name + phone, so the schedule reads correctly.
  let heldSlot: string | null = null;
  const startsAtRaw = typeof (body as Record<string, unknown>).startsAt === 'string'
    ? ((body as Record<string, unknown>).startsAt as string)
    : null;

  if (startsAtRaw && !Number.isNaN(new Date(startsAtRaw).getTime())) {
    try {
      const bookable = assertBookable({
        startsAt: new Date(startsAtRaw).toISOString(),
        durationMinutes: durationForHours(estimate.estimatedHours),
        locationType: 'mobile',
      });

      if (bookable.ok && bookable.window) {
        const leadCustomer = createUser({
          // Synthetic address — unique per estimate, never used to log in, and
          // deliberately NOT the customer's real email (see note above).
          email: `lead-${record.id}@estimate.local`,
          // Not a valid scrypt hash, so verifyPassword can never match it.
          passwordHash: '!estimate-hold-no-login',
          name: record.name,
          phone: record.phone,
          smsConsent: record.smsConsent,
          role: 'customer',
        });

        createAppointment({
          customerId: leadCustomer.id,
          vehicleId: null,
          employeeId: null,
          estimateId: record.id,
          industry: record.industry,
          sizeClass: record.sizeClass,
          serviceIds: record.serviceIds,
          addOnIds: record.addOnIds,
          locationType: 'mobile',
          address: '',
          serviceAreaId: null,
          startsAt: bookable.window.startsAt,
          endsAt: bookable.window.endsAt,
          travelMinutes: bookable.window.travelMinutes,
          bufferMinutes: bookable.window.bufferMinutes,
          quotedTotal: estimate.total,
          quotedTotalMax: estimate.totalMax,
          estimatedHours: estimate.estimatedHours,
          notes:
            `Tentative hold from website estimate ${record.reference}. ` +
            `Contact: ${record.name} · ${record.phone} · ${record.email}. ` +
            `Confirm or release from the schedule.`,
          source: 'estimate',
        });

        heldSlot = bookable.window.startsAt;
      }
    } catch (e) {
      console.error('[estimates] slot hold failed', e);
    }
  }

  // ── 5. Notify ─────────────────────────────────────────────────────────────
  // The request is already saved; a notification failure degrades but does not
  // fail the submission.
  let notified;
  try {
    notified = await sendEstimateNotifications(record);
    updateNotificationStatus(
      record.id,
      'email',
      notified.customerEmail === 'sent' && notified.businessEmail === 'sent'
        ? 'sent'
        : `${notified.customerEmail} / ${notified.businessEmail}`
    );
    updateNotificationStatus(
      record.id,
      'sms',
      notified.customerSms === 'sent' && notified.businessSms === 'sent'
        ? 'sent'
        : `${notified.customerSms} / ${notified.businessSms}`
    );
  } catch (e) {
    console.error('[estimates] notification dispatch failed', e);
  }

  return NextResponse.json({
    ok: true,
    reference: record.reference,
    quotedTotal: record.quotedTotal,
    quotedTotalMax: record.quotedTotalMax,
    estimatedHours: record.estimatedHours,
    isPlaceholderPricing: record.isPlaceholderPricing,
    // Surfaced so the confirmation screen can tell the truth about what was
    // actually sent, instead of claiming an email that never went out.
    notifications: notified ?? null,
    // The tentative slot we reserved, if the customer chose one and it was still
    // free. Null when they were flexible or the slot was taken first.
    heldSlot,
  });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}

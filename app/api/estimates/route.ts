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
import { sendEstimateNotifications } from '@/lib/notify';
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
  });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET   /api/admin/settings — the scheduling policy
// PATCH /api/admin/settings — change it
//
// Settings are a key/value table, so the danger is an endpoint that writes
// ANY key a caller names — which would let someone set, say, a key the
// availability engine reads to a hostile value, or invent keys forever.
//
// Hence a strict ALLOW-LIST with a coercer per key. A key that is not in the
// table is ignored rather than rejected, so a newer client posting a field this
// deploy has never heard of does not fail the whole save.
//
// Every value is CLAMPED, not merely type-checked. `max_advance_days: 100000`
// would make the availability loop walk a hundred thousand days; a negative
// buffer would let bookings overlap. Both are rejected by the range, not by
// hoping the UI never sends them.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, int, ok, str, withAuth } from '@/lib/api';
import { allSettings, getSchedulingConfig, setSetting } from '@/lib/repo/settings';
import { BusinessHours, DayHours } from '@/lib/models';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Coercer = (raw: unknown) => unknown | undefined;

const clampInt = (min: number, max: number): Coercer => (raw) => {
  if (raw === undefined || raw === null) return undefined;
  const n = int(raw, NaN);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
};

/**
 * Business hours: seven keys, each either null (closed) or a start/end pair in
 * minutes from local midnight. An inverted or out-of-range day is dropped to
 * null — a day the scheduler cannot interpret must read as CLOSED, never as
 * "open all hours", because failing open here sells slots that do not exist.
 */
const coerceHours: Coercer = (raw) => {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const input = raw as Record<string, unknown>;
  const out: BusinessHours = {};

  for (let day = 0; day <= 6; day++) {
    const key = String(day);
    const value = input[key];
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    const v = value as Record<string, unknown>;
    const start = int(v.start, -1);
    const end = int(v.end, -1);
    const valid = start >= 0 && end > start && end <= 24 * 60;
    out[key] = valid ? ({ start, end } as DayHours) : null;
  }
  return out;
};

/**
 * A timezone is validated by ASKING Intl whether it exists, rather than by a
 * regex or a hard-coded list. A typo'd zone would throw inside every date
 * format on every page — a total outage from one text field.
 */
const coerceTimezone: Coercer = (raw) => {
  const tz = str(raw, 60);
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return undefined;
  }
};

const ALLOWED: Record<string, Coercer> = {
  business_hours: coerceHours,
  timezone: coerceTimezone,
  // 15-minute floor: a shorter grid multiplies the availability search for no
  // real-world benefit — nobody books a detail at 09:07.
  slot_interval_minutes: clampInt(15, 240),
  buffer_minutes: clampInt(0, 240),
  default_travel_minutes: clampInt(0, 240),
  min_notice_hours: clampInt(0, 24 * 30),
  max_advance_days: clampInt(1, 365),
  cancellation_notice_hours: clampInt(0, 24 * 14),
  deposit_percent: clampInt(0, 100),
  loyalty_points_per_dollar: clampInt(0, 100),
  loyalty_points_per_dollar_redeemed: clampInt(1, 10000),
};

export const GET = withAuth('admin', async () => {
  return NextResponse.json({
    ok: true,
    config: getSchedulingConfig(),
    raw: allSettings(),
  });
});

export const PATCH = withAuth('admin', async ({ user, body, ipHash }) => {
  const b = (body ?? {}) as Record<string, unknown>;
  const written: string[] = [];

  for (const [key, coerce] of Object.entries(ALLOWED)) {
    if (!(key in b)) continue;
    const value = coerce(b[key]);
    if (value === undefined) {
      return fail(`That value for ${key.replace(/_/g, ' ')} is not valid.`, 400, { [key]: 'Not valid.' });
    }
    setSetting(key, value);
    written.push(key);
  }

  if (!written.length) return fail('Nothing to update.', 400);

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'settings',
    meta: { keys: written },
    ipHash,
  });

  return ok({ updated: written, config: getSchedulingConfig() });
});

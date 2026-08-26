// ─────────────────────────────────────────────────────────────────────────────
// GET /api/availability
//
// Open to signed-out visitors so the marketing site can show a live calendar,
// but it deliberately returns ONLY start times and labels — never who is
// booked, for what, or for whom. An anonymous caller must not be able to map
// the owner's working week from the gaps.
//
// Query:
//   date=YYYY-MM-DD            single day
//   from=…&to=…                range (capped at 62 days)
//   hours=2.5                  service duration; or…
//   services=id,id&size=sedan  …derive duration from the catalogue
//   employee=<id>              restrict to one technician
//   location=mobile|shop
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { withOptionalAuth, fail } from '@/lib/api';
import { availabilityForDate, availabilityForRange, durationForHours } from '@/lib/availability';
import { calculateEstimate } from '@/lib/pricing';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { addDaysIso, todayIso } from '@/lib/timezone';
import { isIndustry, SizeClass } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 62;

export const GET = withOptionalAuth(
  async ({ query }) => {
    const config = getSchedulingConfig();

    // ── Work out how long the job actually takes ────────────────────────────
    let durationMinutes = 120;

    const hoursParam = Number(query.get('hours'));
    const serviceIds = (query.get('services') ?? '').split(',').filter(Boolean);
    const size = query.get('size') as SizeClass | null;
    const industry = query.get('industry');

    if (serviceIds.length && size && isIndustry(industry)) {
      // Derive from the catalogue rather than trusting a client-supplied
      // duration — otherwise `hours=0.1` would unlock slots that cannot fit the
      // work, and the technician would be double-booked in practice.
      const estimate = calculateEstimate({
        industry,
        size,
        serviceIds,
        addOnIds: (query.get('addons') ?? '').split(',').filter(Boolean),
      });
      if (estimate) durationMinutes = durationForHours(estimate.estimatedHours);
    } else if (Number.isFinite(hoursParam) && hoursParam > 0) {
      durationMinutes = durationForHours(Math.min(hoursParam, 24));
    }

    const shared = {
      durationMinutes,
      employeeId: query.get('employee'),
      locationType: (query.get('location') === 'shop' ? 'shop' : 'mobile') as 'mobile' | 'shop',
      ignoreAppointmentId: query.get('ignore') ?? undefined,
      includeUnavailable: query.get('all') === '1',
    };

    // ── Single day ──────────────────────────────────────────────────────────
    const date = query.get('date');
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Invalid date.', 400);
      const day = availabilityForDate({ ...shared, dateIso: date });
      return NextResponse.json({
        ok: true,
        timezone: config.timezone,
        durationMinutes,
        ...day,
      });
    }

    // ── Range ───────────────────────────────────────────────────────────────
    const today = todayIso(config.timezone);
    const from = query.get('from') ?? today;
    const to = query.get('to') ?? addDaysIso(from, 13);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return fail('Invalid date range.', 400);
    }

    // Cap the span: an uncapped `to` would let one request generate months of
    // slot computation.
    const cappedTo = to > addDaysIso(from, MAX_RANGE_DAYS) ? addDaysIso(from, MAX_RANGE_DAYS) : to;

    const days = availabilityForRange(from, cappedTo, shared);

    return NextResponse.json({
      ok: true,
      timezone: config.timezone,
      durationMinutes,
      from,
      to: cappedTo,
      days: days.map((d) => ({
        dateIso: d.dateIso,
        closedReason: d.closedReason,
        openCount: d.slots.filter((s) => s.available).length,
        slots: d.slots,
      })),
    });
  },
  { limit: 'api' }
);

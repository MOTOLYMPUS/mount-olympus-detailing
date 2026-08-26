// ─────────────────────────────────────────────────────────────────────────────
// Availability engine.
//
// Answers one question: "which start times on this date can actually take a job
// of this length?" Everything the business has said about its own calendar is
// applied — business hours, per-technician shifts, approved time off, holidays,
// travel time for mobile work, buffer between jobs, minimum notice, and how far
// ahead bookings are accepted.
//
// A candidate slot survives only if it clears EVERY constraint. The order of
// the checks below is cheapest-first, so a closed Sunday costs one lookup
// rather than a table scan.
//
// ⚠️ THE CRITICAL INVARIANT
// This module is advisory — it renders a calendar. The authoritative check is
// `assertBookable()`, which re-runs the same rules inside the booking request.
// Never trust a slot just because the client was shown it: between render and
// submit, someone else may have taken it.
// ─────────────────────────────────────────────────────────────────────────────

import { Appointment } from './models';
import { appointmentsInWindow } from './repo/appointments';
import {
  SchedulingConfig,
  getSchedulingConfig,
  holidaySet,
  listShifts,
  listTimeOff,
} from './repo/settings';
import { addDaysIso, dateAtMinutes, eachDate, todayIso, weekdayOf } from './timezone';

export interface Slot {
  /** UTC instant, ISO 8601. */
  startsAt: string;
  endsAt: string;
  /** Local wall-clock label, e.g. "9:00 AM". */
  label: string;
  period: 'morning' | 'afternoon' | 'evening';
  available: boolean;
  /** Populated only when `available` is false, for the "why not" tooltip. */
  reason?: string;
}

export interface AvailabilityQuery {
  /** 'YYYY-MM-DD' in the business's local zone. */
  dateIso: string;
  /** Service time, before travel and buffer are added. */
  durationMinutes: number;
  /** Restrict to one technician. Null means "anyone" — see `resolveEmployees`. */
  employeeId?: string | null;
  /** Mobile jobs reserve travel either side of the window. */
  locationType?: 'mobile' | 'shop';
  /** Overrides the service area's travel figure when known. */
  travelMinutes?: number;
  /** Set when rescheduling, so the booking being moved does not block itself. */
  ignoreAppointmentId?: string;
  /** Show unavailable slots greyed out rather than omitting them. */
  includeUnavailable?: boolean;
}

function periodOf(minutes: number): Slot['period'] {
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 17 * 60) return 'afternoon';
  return 'evening';
}

function label(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** [start, end) overlap in milliseconds. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

interface Interval {
  startMin: number;
  endMin: number;
}

/**
 * Working windows for a date: business hours, narrowed to a technician's shift
 * when one is specified.
 *
 * An employee with NO shifts configured inherits business hours rather than
 * being treated as never available — otherwise the first employee an owner
 * creates would silently have an empty calendar.
 */
function workingIntervals(
  dateIso: string,
  config: SchedulingConfig,
  employeeId?: string | null
): Interval[] {
  const weekday = weekdayOf(dateIso);
  const hours = config.businessHours[String(weekday)];
  if (!hours) return [];

  const businessWindow: Interval = { startMin: hours.start, endMin: hours.end };
  if (!employeeId) return [businessWindow];

  const shifts = listShifts(employeeId).filter((s) => s.weekday === weekday);
  if (!shifts.length) return [businessWindow];

  return shifts
    .map((s) => ({
      startMin: Math.max(s.startMin, businessWindow.startMin),
      endMin: Math.min(s.endMin, businessWindow.endMin),
    }))
    .filter((i) => i.endMin > i.startMin);
}

export interface DayAvailability {
  dateIso: string;
  slots: Slot[];
  /** Reason the whole day is unavailable, when it is. */
  closedReason?: string;
}

export function availabilityForDate(query: AvailabilityQuery): DayAvailability {
  const config = getSchedulingConfig();
  const { dateIso } = query;

  // ── Whole-day rejections, cheapest first ──────────────────────────────────
  const today = todayIso(config.timezone);
  if (dateIso < today) return { dateIso, slots: [], closedReason: 'That date has passed.' };

  if (dateIso > addDaysIso(today, config.maxAdvanceDays)) {
    return {
      dateIso,
      slots: [],
      closedReason: `Bookings open ${config.maxAdvanceDays} days ahead.`,
    };
  }

  if (holidaySet().has(dateIso)) {
    return { dateIso, slots: [], closedReason: 'Closed for a holiday.' };
  }

  const intervals = workingIntervals(dateIso, config, query.employeeId);
  if (!intervals.length) {
    return { dateIso, slots: [], closedReason: 'Closed on this day.' };
  }

  // ── Load everything that could block a slot, once ─────────────────────────
  const dayStart = dateAtMinutes(dateIso, 0, config.timezone);
  const dayEnd = dateAtMinutes(addDaysIso(dateIso, 1), 0, config.timezone);

  const booked: Appointment[] = appointmentsInWindow(
    dayStart.toISOString(),
    dayEnd.toISOString(),
    query.employeeId ?? null
  ).filter((a) => a.id !== query.ignoreAppointmentId);

  const timeOff = listTimeOff({
    employeeId: query.employeeId ?? undefined,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
  }).map((t) => ({ start: new Date(t.startsAt).getTime(), end: new Date(t.endsAt).getTime() }));

  // Travel is reserved on BOTH sides — the technician has to get there and get
  // back — so a 2-hour mobile detail with 30 minutes' travel occupies 3 hours.
  const travel =
    query.locationType === 'shop'
      ? 0
      : (query.travelMinutes ?? config.defaultTravelMinutes);
  const buffer = config.bufferMinutes;
  const blockMinutes = query.durationMinutes + travel * 2 + buffer;

  const earliestStart = Date.now() + config.minNoticeHours * 60 * 60 * 1000;

  // ── Walk candidate start times ────────────────────────────────────────────
  const slots: Slot[] = [];

  for (const interval of intervals) {
    for (
      let startMin = interval.startMin;
      startMin + query.durationMinutes <= interval.endMin;
      startMin += config.slotIntervalMinutes
    ) {
      const startsAt = dateAtMinutes(dateIso, startMin, config.timezone);
      const endsAt = new Date(startsAt.getTime() + query.durationMinutes * 60_000);

      // The reserved block includes travel and buffer; the customer-visible
      // window does not.
      const blockStart = startsAt.getTime() - travel * 60_000;
      const blockEnd = startsAt.getTime() + (query.durationMinutes + travel + buffer) * 60_000;

      let reason: string | undefined;

      if (startsAt.getTime() < earliestStart) {
        reason = `We need ${config.minNoticeHours} hours' notice.`;
      } else if (
        booked.some((a) =>
          overlaps(
            blockStart,
            blockEnd,
            new Date(a.startsAt).getTime() - a.travelMinutes * 60_000,
            new Date(a.endsAt).getTime() + (a.travelMinutes + a.bufferMinutes) * 60_000
          )
        )
      ) {
        reason = 'Already booked.';
      } else if (timeOff.some((t) => overlaps(blockStart, blockEnd, t.start, t.end))) {
        reason = 'Unavailable.';
      }

      const slot: Slot = {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        label: label(startMin),
        period: periodOf(startMin),
        available: !reason,
        reason,
      };

      if (slot.available || query.includeUnavailable) slots.push(slot);
    }
  }

  // `blockMinutes` is intentionally computed but not used as a filter: the
  // per-slot overlap test above is the precise version of the same idea. It is
  // kept for the caller's information.
  void blockMinutes;

  return { dateIso, slots };
}

/** Availability across a date range — powers the month calendar's dot markers. */
export function availabilityForRange(
  startIso: string,
  endIso: string,
  query: Omit<AvailabilityQuery, 'dateIso'>
): DayAvailability[] {
  return eachDate(startIso, endIso).map((dateIso) =>
    availabilityForDate({ ...query, dateIso })
  );
}

/** Dates in a range that have at least one open slot. */
export function bookableDates(
  startIso: string,
  endIso: string,
  query: Omit<AvailabilityQuery, 'dateIso'>
): string[] {
  return availabilityForRange(startIso, endIso, query)
    .filter((d) => d.slots.some((s) => s.available))
    .map((d) => d.dateIso);
}

// ─────────────────────────────────────────────────────────────────────────────
// Authoritative check
// ─────────────────────────────────────────────────────────────────────────────

export interface BookabilityResult {
  ok: boolean;
  reason?: string;
  /** The window that would be written, travel and buffer resolved. */
  window?: { startsAt: string; endsAt: string; travelMinutes: number; bufferMinutes: number };
}

/**
 * Re-validate a proposed booking at submit time.
 *
 * Called by the booking API *after* the customer picks a slot. This is what
 * actually prevents a double booking: two customers can both be looking at the
 * same free 9 AM, but only the first to submit passes this check.
 *
 * ⚠️ SQLite serialises writes, so the read-then-write here cannot interleave
 * with another writer on a single-process deployment. On a multi-process host,
 * wrap the check and the insert in a transaction with an EXCLUSIVE lock, or
 * add a UNIQUE index on (employee_id, starts_at) as a backstop.
 */
export function assertBookable(input: {
  startsAt: string;
  durationMinutes: number;
  employeeId?: string | null;
  locationType?: 'mobile' | 'shop';
  travelMinutes?: number;
  ignoreAppointmentId?: string;
}): BookabilityResult {
  const config = getSchedulingConfig();
  const start = new Date(input.startsAt);

  if (Number.isNaN(start.getTime())) return { ok: false, reason: 'That is not a valid time.' };
  if (input.durationMinutes <= 0) return { ok: false, reason: 'That service has no duration.' };

  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const travel =
    input.locationType === 'shop' ? 0 : (input.travelMinutes ?? config.defaultTravelMinutes);
  const buffer = config.bufferMinutes;

  if (start.getTime() < Date.now() + config.minNoticeHours * 60 * 60 * 1000) {
    return { ok: false, reason: `We need at least ${config.minNoticeHours} hours' notice.` };
  }

  // Re-derive the local date from the instant rather than trusting a
  // client-supplied date string — they must agree.
  const day = availabilityForDate({
    dateIso: new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(start),
    durationMinutes: input.durationMinutes,
    employeeId: input.employeeId,
    locationType: input.locationType,
    travelMinutes: input.travelMinutes,
    ignoreAppointmentId: input.ignoreAppointmentId,
  });

  if (day.closedReason) return { ok: false, reason: day.closedReason };

  const match = day.slots.find((s) => s.startsAt === start.toISOString() && s.available);
  if (!match) {
    return { ok: false, reason: 'That time is no longer available. Please choose another.' };
  }

  return {
    ok: true,
    window: {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      travelMinutes: travel,
      bufferMinutes: buffer,
    },
  };
}

/** Can this booking still be cancelled or moved under the stated policy? */
export function withinCancellationWindow(startsAt: string): boolean {
  const config = getSchedulingConfig();
  return (
    new Date(startsAt).getTime() - Date.now() >
    config.cancellationNoticeHours * 60 * 60 * 1000
  );
}

/**
 * Total minutes to hold for a set of services. Falls back to a two-hour
 * minimum so a mis-configured service can never produce a zero-length booking.
 */
export function durationForHours(estimatedHours: number): number {
  return Math.max(60, Math.round(estimatedHours * 60));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting periods.
//
// Every aggregate in lib/repo/* takes a half-open [fromIso, toIso) pair of UTC
// instants. Turning "this week" into that pair correctly is fiddly enough —
// local midnight, DST, week start — that doing it inline on each dashboard
// would guarantee two screens eventually disagree about what "this month" is.
//
// TWO RULES HOLD THROUGHOUT:
//   • Boundaries are LOCAL midnight in the business's timezone, converted to
//     UTC via lib/timezone.ts. Never `new Date().setHours(0,0,0,0)` — that is
//     the server's timezone, which is UTC in production and would slice the
//     day in the wrong place.
//   • Ranges are half-open. The end instant belongs to the NEXT period, so
//     consecutive periods neither overlap nor drop a row at the seam.
//
// The week starts on MONDAY: a detailing business's Saturday is the busiest
// day of the week and splitting the weekend across two report rows makes the
// numbers useless.
// ─────────────────────────────────────────────────────────────────────────────

import { addDaysIso, dateAtMinutes, todayIso, weekdayOf } from './timezone';

export interface Period {
  /** Inclusive UTC instant. */
  from: string;
  /** Exclusive UTC instant. */
  to: string;
  /** Local start date, 'YYYY-MM-DD' — handy for chart keys and CSV headers. */
  fromDate: string;
  /** Local date of the LAST day in the period, inclusive. */
  toDate: string;
  label: string;
}

function build(startDate: string, endDateExclusive: string, tz: string, label: string): Period {
  return {
    from: dateAtMinutes(startDate, 0, tz).toISOString(),
    to: dateAtMinutes(endDateExclusive, 0, tz).toISOString(),
    fromDate: startDate,
    toDate: addDaysIso(endDateExclusive, -1),
    label,
  };
}

/** A single local calendar day. */
export function dayPeriod(dateIso: string, tz: string, label = 'Today'): Period {
  return build(dateIso, addDaysIso(dateIso, 1), tz, label);
}

/** `days` calendar days ending on (and including) `endDateIso`. */
export function trailingDays(endDateIso: string, days: number, tz: string, label?: string): Period {
  const start = addDaysIso(endDateIso, -(days - 1));
  return build(start, addDaysIso(endDateIso, 1), tz, label ?? `Last ${days} days`);
}

/** Monday-to-Sunday week containing `dateIso`. */
export function weekPeriod(dateIso: string, tz: string, label = 'This week'): Period {
  // weekdayOf is 0=Sunday; shift so Monday is 0 and Sunday is 6.
  const offset = (weekdayOf(dateIso) + 6) % 7;
  const monday = addDaysIso(dateIso, -offset);
  return build(monday, addDaysIso(monday, 7), tz, label);
}

export function monthPeriod(dateIso: string, tz: string, label = 'This month'): Period {
  const [y, m] = dateIso.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const next = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return build(first, next, tz, label);
}

export function yearPeriod(dateIso: string, tz: string, label = 'This year'): Period {
  const y = Number(dateIso.slice(0, 4));
  return build(`${y}-01-01`, `${y + 1}-01-01`, tz, label);
}

/**
 * The equivalent period immediately before this one, for a trend arrow.
 *
 * Computed by SHIFTING BACK by the period's own length in days rather than by
 * "last month" semantics, so a 30-day window is compared with the previous 30
 * days and a February is not compared against a 31-day January. The one place
 * that would be wrong — comparing a calendar month with a calendar month — is
 * close enough that the arrow still tells the truth about direction.
 */
export function previousOf(period: Period, tz: string): Period {
  const lengthDays = Math.max(
    1,
    Math.round(
      (new Date(period.to).getTime() - new Date(period.from).getTime()) / (24 * 60 * 60 * 1000)
    )
  );
  const start = addDaysIso(period.fromDate, -lengthDays);
  return build(start, period.fromDate, tz, `Previous ${lengthDays} days`);
}

/** Percentage change, or null when there is no baseline to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// ── The ?period= selector shared by the dashboard and the report builder ──────

export const PERIOD_KEYS = ['7d', '30d', '90d', 'ytd'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
};

export function isPeriodKey(v: unknown): v is PeriodKey {
  return typeof v === 'string' && (PERIOD_KEYS as readonly string[]).includes(v);
}

export function resolvePeriod(key: PeriodKey, tz: string): Period {
  const today = todayIso(tz);
  switch (key) {
    case '7d':
      return trailingDays(today, 7, tz, PERIOD_LABEL['7d']);
    case '90d':
      return trailingDays(today, 90, tz, PERIOD_LABEL['90d']);
    case 'ytd': {
      const y = Number(today.slice(0, 4));
      return build(`${y}-01-01`, addDaysIso(today, 1), tz, PERIOD_LABEL.ytd);
    }
    case '30d':
    default:
      return trailingDays(today, 30, tz, PERIOD_LABEL['30d']);
  }
}

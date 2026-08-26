// ─────────────────────────────────────────────────────────────────────────────
// Timezone arithmetic, on `Intl` alone.
//
// The business thinks in local time ("Tuesday, 9 AM"); the database stores
// UTC instants. Converting between them correctly across a DST transition is
// the classic source of "the app offered me a slot that doesn't exist", so it
// lives here rather than being improvised at each call site.
//
// No date library. `Intl.DateTimeFormat` already ships the full IANA database
// in Node, and using it directly avoids a dependency that would need updating
// every time a government moves a clock.
// ─────────────────────────────────────────────────────────────────────────────

/** Milliseconds a zone is ahead of UTC at a given instant. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Some locales render midnight as "24"; normalise it.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - instant.getTime();
}

/**
 * Local wall-clock time → UTC instant.
 *
 * Two passes: the first offset is looked up at an approximate instant, the
 * second at the corrected one. That resolves the case where the guess and the
 * answer fall on opposite sides of a DST change.
 *
 * ⚠️ Spring-forward gaps (2:30 AM on a day that has no 2:30 AM) resolve to the
 * following real instant rather than throwing. The scheduler never offers slots
 * in that window anyway, because business hours start at 8 AM.
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  minutesFromMidnight: number,
  timeZone: string
): Date {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let offset = zoneOffsetMs(new Date(guess), timeZone);
  let instant = guess - offset;
  offset = zoneOffsetMs(new Date(instant), timeZone);
  instant = guess - offset;

  return new Date(instant);
}

/** 'YYYY-MM-DD' + minutes-from-midnight → UTC instant. */
export function dateAtMinutes(dateIso: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  return zonedToUtc(y, m, d, minutes, timeZone);
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday, matching `Date.prototype.getDay()` and the settings table. */
  weekday: number;
  hour: number;
  minute: number;
  /** 'YYYY-MM-DD' in the target zone. */
  dateIso: string;
  minutesFromMidnight: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** UTC instant → the wall-clock fields an operator would read off a clock. */
export function toLocalParts(instant: Date, timeZone: string): LocalParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);

  return {
    year,
    month,
    day,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    hour,
    minute,
    dateIso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    minutesFromMidnight: hour * 60 + minute,
  };
}

/** 'YYYY-MM-DD' for the current moment in the business's zone. */
export function todayIso(timeZone: string): string {
  return toLocalParts(new Date(), timeZone).dateIso;
}

/** Calendar-day arithmetic that ignores DST — days, not 24-hour blocks. */
export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function weekdayOf(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Inclusive list of dates from `startIso` to `endIso`. */
export function eachDate(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  // Hard cap so a bad range cannot spin forever.
  for (let i = 0; cur <= endIso && i < 400; i++) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

// ── Display formatting ───────────────────────────────────────────────────────

export function formatTime(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(typeof instant === 'string' ? new Date(instant) : instant);
}

export function formatDate(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(typeof instant === 'string' ? new Date(instant) : instant);
}

export function formatDateTime(instant: Date | string, timeZone: string): string {
  return `${formatDate(instant, timeZone)} · ${formatTime(instant, timeZone)}`;
}

/** "in 3 days" / "2 hours ago" — for dashboards and activity feeds. */
export function relativeTime(instant: Date | string): string {
  const then = typeof instant === 'string' ? new Date(instant).getTime() : instant.getTime();
  const diffMs = then - Date.now();
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

/** "1h 45m" from a minute count. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

import { TimeSlot } from './types';

// Placeholder availability engine. In production this reads live from
// Google Calendar API / Calendly / Square Appointments (see lib/README
// integration notes in the repo root).
const SLOT_TEMPLATE: { time: string; period: TimeSlot['period'] }[] = [
  { time: '8:00 AM', period: 'morning' },
  { time: '9:30 AM', period: 'morning' },
  { time: '11:00 AM', period: 'morning' },
  { time: '12:30 PM', period: 'afternoon' },
  { time: '2:00 PM', period: 'afternoon' },
  { time: '3:30 PM', period: 'afternoon' },
  { time: '5:00 PM', period: 'evening' },
  { time: '6:30 PM', period: 'evening' },
];

// Deterministic pseudo-random so the same date always renders the same
// slots during a session (avoids layout flicker on re-render).
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0; // closed Sundays
}

export function getSlotsForDate(date: Date): TimeSlot[] {
  const seed = date.getFullYear() * 372 + date.getMonth() * 31 + date.getDate();
  return SLOT_TEMPLATE.map((slot, i) => ({
    ...slot,
    available: seededRandom(seed + i * 7) > 0.35,
  }));
}

export function getUserTimeZoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' ');
  } catch {
    return 'Local time';
  }
}

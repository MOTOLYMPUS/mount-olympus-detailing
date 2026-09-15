'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Month calendar for the owner schedule.
//
// A real wall calendar: seven columns, one row per week, every day of the
// month. Each day shows how many bookings it holds; tapping a day expands a
// panel under the grid listing that day's bookings with links into them.
//
// Month navigation is a pair of LINKS (?month=YYYY-MM), not client state, so
// the server fetches exactly the month on screen and the URL stays
// bookmarkable — the same rule the page's filter form follows. The only
// client state here is which day is expanded.
//
// Everything display-related (times, money) arrives pre-formatted from the
// server, so this component never has to know the business timezone.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useState } from 'react';
import clsx from 'clsx';
import { StatusBadge } from '@/components/ui';
import { AppointmentStatus } from '@/lib/models';
import { weekdayOf } from '@/lib/timezone';

export interface CalendarBooking {
  id: string;
  time: string;
  customerName: string;
  status: AppointmentStatus;
  services: string;
  employeeName: string;
  total: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export default function MonthCalendar({
  month,
  today,
  bookingsByDay,
  prevHref,
  nextHref,
}: {
  /** 'YYYY-MM' */
  month: string;
  /** 'YYYY-MM-DD' in the business timezone */
  today: string;
  bookingsByDay: Record<string, CalendarBooking[]>;
  prevHref: string;
  nextHref: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const [year, monthNum] = month.split('-').map(Number);
  const total = daysInMonth(year, monthNum);
  const firstWeekday = weekdayOf(`${month}-01`);

  // Leading blanks so the 1st lands under its weekday, then every day, then
  // trailing blanks to complete the last row.
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= total; d++) cells.push(`${month}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedBookings = selected ? bookingsByDay[selected] ?? [] : [];
  const monthCount = Object.values(bookingsByDay).reduce((n, list) => n + list.length, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={prevHref}
          aria-label="Previous month"
          className="rounded-sm border border-white/15 px-3 py-1.5 font-mono text-[12px] text-muted transition-colors hover:border-white/40 hover:text-white"
        >
          ‹
        </Link>
        <div className="text-center">
          <p className="font-display text-lg font-semibold text-white">
            {MONTHS[monthNum - 1]} {year}
          </p>
          <p className="font-mono text-[11px] text-subtle">
            {monthCount} booking{monthCount === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href={nextHref}
          aria-label="Next month"
          className="rounded-sm border border-white/15 px-3 py-1.5 font-mono text-[12px] text-muted transition-colors hover:border-white/40 hover:text-white"
        >
          ›
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTHS[monthNum - 1]} ${year}`}>
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            role="columnheader"
            className="py-1 text-center font-mono text-[10px] uppercase tracking-widest2 text-subtle"
          >
            {w}
          </div>
        ))}

        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} aria-hidden="true" />;

          const list = bookingsByDay[date] ?? [];
          const count = list.length;
          const isToday = date === today;
          const isSelected = date === selected;
          const isPast = date < today;

          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${date}, ${count} booking${count === 1 ? '' : 's'}`}
              onClick={() => setSelected(isSelected ? null : date)}
              className={clsx(
                'flex aspect-square flex-col items-center justify-start gap-1 rounded-sm border p-1 text-sm transition-colors duration-150 sm:aspect-auto sm:min-h-[64px] sm:items-start sm:p-2',
                isSelected
                  ? 'border-apex bg-apex/15 text-white'
                  : count > 0
                    ? 'border-white/15 bg-white/[0.04] text-white hover:border-white/40'
                    : 'border-white/5 text-muted hover:border-white/25 hover:text-white',
                isPast && !isSelected && 'opacity-60'
              )}
            >
              <span
                className={clsx(
                  'font-mono text-[12px] leading-none',
                  isToday && 'rounded-full bg-white px-1.5 py-0.5 text-obsidian'
                )}
              >
                {Number(date.slice(-2))}
              </span>
              {count > 0 && (
                <span className="rounded-full bg-apex px-1.5 py-0.5 font-mono text-[10px] leading-none text-white">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 rounded-sm border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              {new Date(`${selected}T12:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="font-mono text-[11px] text-muted hover:text-white"
            >
              Close
            </button>
          </div>

          {selectedBookings.length === 0 ? (
            <p className="text-sm text-muted">No bookings this day.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {selectedBookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/appointments/${b.id}`}
                      className="text-sm font-medium text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                    >
                      {b.time} · {b.customerName}
                    </Link>
                    <p className="truncate text-[12px] text-muted">
                      {b.services}
                      {b.services && ' · '}
                      {b.employeeName}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-[12px] text-muted">{b.total}</span>
                    <StatusBadge status={b.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

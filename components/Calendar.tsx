'use client';

import { useMemo, useState } from 'react';
import { getSlotsForDate, isBusinessDay, getUserTimeZoneLabel } from '@/lib/availability';
import { TimeSlot } from '@/lib/types';

interface Props {
  selectedDate: string | null;
  selectedTime: string | null;
  onSelect: (date: string, time: string) => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Calendar({ selectedDate, selectedTime, onSelect }: Props) {
  const today = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)), []);
  const [viewDate, setViewDate] = useState(new Date(today));
  const [activeDay, setActiveDay] = useState<Date | null>(
    selectedDate ? new Date(selectedDate) : null
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  const slots: TimeSlot[] = activeDay ? getSlotsForDate(activeDay) : [];
  const grouped = {
    morning: slots.filter((s) => s.period === 'morning'),
    afternoon: slots.filter((s) => s.period === 'afternoon'),
    evening: slots.filter((s) => s.period === 'evening'),
  };

  const canGoPrev = new Date(year, month, 1) > today;

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_260px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <button
            disabled={!canGoPrev}
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="font-mono text-sm text-white/60 hover:text-white disabled:opacity-20"
            aria-label="Previous month"
          >
            ←
          </button>
          <p className="font-display text-sm font-bold uppercase tracking-widest2">
            {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="font-mono text-sm text-white/60 hover:text-white"
            aria-label="Next month"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1 font-mono text-[10px] uppercase text-smoke/40">
              {d}
            </span>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const disabled = date < today || !isBusinessDay(date);
            const isActive = activeDay && toKey(activeDay) === toKey(date);
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => setActiveDay(date)}
                className={`aspect-square rounded-sm font-mono text-xs transition-colors duration-150 ${
                  disabled
                    ? 'cursor-not-allowed text-white/15'
                    : isActive
                    ? 'bg-apex text-white'
                    : 'text-white/70 hover:bg-white/10'
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-widest2 text-smoke/40">
          Closed Sundays · Times shown in {getUserTimeZoneLabel()}
        </p>
      </div>

      <div>
        {!activeDay ? (
          <p className="text-sm text-smoke/50">Select a date to see open times.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {(['morning', 'afternoon', 'evening'] as const).map((period) =>
              grouped[period].length ? (
                <div key={period}>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest2 text-smoke/40">
                    {period}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {grouped[period].map((slot) => {
                      const isSel =
                        selectedDate === toKey(activeDay) && selectedTime === slot.time;
                      return (
                        <button
                          key={slot.time}
                          disabled={!slot.available}
                          onClick={() => onSelect(toKey(activeDay), slot.time)}
                          className={`rounded-sm border px-3 py-2 font-mono text-[11px] transition-colors duration-150 ${
                            !slot.available
                              ? 'cursor-not-allowed border-white/8 text-white/20 line-through'
                              : isSel
                              ? 'border-apex bg-apex text-white'
                              : 'border-white/15 text-white/75 hover:border-white/40'
                          }`}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}

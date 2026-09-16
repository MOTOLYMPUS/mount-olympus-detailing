'use client';

// ─────────────────────────────────────────────────────────────────────────────
// SlotPicker — a live availability calendar for the public estimate flow.
//
// It calls the SAME /api/availability endpoint the logged-in booking wizard
// uses, so the times a visitor sees already have business hours, buffers,
// travel, holidays, time off and — crucially — every existing booking and
// estimate hold applied. This component renders; it never decides what is free.
//
// Duration is derived server-side from the chosen services + size, so a 90-min
// wash and a 6-hour correction correctly offer different gaps. We therefore
// refetch whenever the selection that changes duration changes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { Industry, SizeClass } from '@/lib/types';

interface Slot {
  startsAt: string;
  endsAt: string;
  label: string;
  period: 'morning' | 'afternoon' | 'evening';
  available: boolean;
}

interface DayResult {
  dateIso: string;
  closedReason?: string;
  openCount: number;
  slots: Slot[];
}

interface Props {
  industry: Industry;
  size: SizeClass;
  serviceIds: string[];
  addOnIds: string[];
  /** Selected slot, ISO 8601 UTC, or '' for none. */
  value: string;
  onChange: (startsAt: string, dateIso: string) => void;
}

export default function SlotPicker({ industry, size, serviceIds, addOnIds, value, onChange }: Props) {
  const [days, setDays] = useState<DayResult[]>([]);
  const [dateIso, setDateIso] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!serviceIds.length || !size) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        industry,
        size,
        services: serviceIds.join(','),
        addons: addOnIds.join(','),
        location: 'mobile',
      });
      const res = await fetch(`/api/availability?${params}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? 'We could not load available times.');
        return;
      }
      const nextDays: DayResult[] = data.days ?? [];
      setDays(nextDays);

      // Land the customer on the first day that actually has openings, unless
      // they have already picked one.
      const firstOpen = nextDays.find((d) => d.openCount > 0);
      setDateIso((cur) => cur || firstOpen?.dateIso || nextDays[0]?.dateIso || '');
    } catch {
      setError('We could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
    // dateIso intentionally excluded — switching day reads from the cached
    // response, it does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry, size, serviceIds, addOnIds]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedDay = days.find((d) => d.dateIso === dateIso);

  if (loading) {
    return (
      <p role="status" aria-live="polite" className="py-6 text-center text-sm text-muted">
        Checking the calendar…
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-200">
        {error} You can still submit — we&rsquo;ll arrange a time with you directly.
      </div>
    );
  }

  return (
    <div>
      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const date = new Date(`${d.dateIso}T12:00:00Z`);
          const open = d.openCount > 0;
          return (
            <button
              key={d.dateIso}
              type="button"
              disabled={!open}
              onClick={() => setDateIso(d.dateIso)}
              aria-pressed={dateIso === d.dateIso}
              className={`flex min-w-[60px] shrink-0 flex-col items-center rounded-sm border px-3 py-2.5 transition-colors duration-200 ${
                dateIso === d.dateIso
                  ? 'border-apex bg-apex/10 shadow-[0_0_0_1px_rgba(212,0,26,0.35)]'
                  : open
                    ? 'border-white/20 hover:border-white/50 hover:bg-white/5'
                    : 'cursor-not-allowed border-white/5 opacity-35'
              }`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-subtle">
                {date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
              </span>
              <span className="mt-0.5 text-base text-white">
                {date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}
              </span>
              <span className="mt-0.5 font-mono text-[9px] text-subtle">
                {open ? `${d.openCount} free` : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Times for the chosen day, grouped by part of day */}
      {selectedDay && (
        <div className="mt-4 space-y-4">
          {(['morning', 'afternoon', 'evening'] as const).map((period) => {
            const slots = selectedDay.slots.filter((s) => s.period === period && s.available);
            if (!slots.length) return null;
            return (
              <div key={period}>
                <p className="eyebrow mb-2 capitalize">{period}</p>
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => onChange(value === s.startsAt ? '' : s.startsAt, selectedDay.dateIso)}
                      aria-pressed={value === s.startsAt}
                      className={`rounded-sm border px-4 py-2 font-mono text-[13px] transition-all duration-200 ${
                        value === s.startsAt
                          ? 'border-apex bg-apex/15 text-white shadow-[0_0_0_1px_rgba(212,0,26,0.35)]'
                          : 'border-white/20 text-muted hover:-translate-y-px hover:border-white/50 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {selectedDay.openCount === 0 && (
            <p className="rounded-sm border border-white/15 bg-white/[0.03] px-4 py-3 text-[13px] text-muted">
              {selectedDay.closedReason ??
                'Nothing free that day. Try another — or submit and we&rsquo;ll find a time with you.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

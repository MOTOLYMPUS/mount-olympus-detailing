'use client';

import Calendar from '@/components/Calendar';

interface Props {
  date: string | null;
  time: string | null;
  onSelect: (date: string, time: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepCalendar({ date, time, onSelect, onNext, onBack }: Props) {
  return (
    <div>
      <h3 className="font-display text-2xl font-bold">Pick a date and time</h3>
      <p className="mt-2 text-sm text-smoke/50">Real-time availability — unavailable days are disabled.</p>

      <div className="mt-8">
        <Calendar selectedDate={date} selectedTime={time} onSelect={onSelect} />
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button disabled={!date || !time} onClick={onNext} className="btn-apex flex-1">
          Continue to Payment
        </button>
      </div>
    </div>
  );
}

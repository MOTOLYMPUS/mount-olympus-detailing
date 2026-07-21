'use client';

import { BookingState, Package } from '@/lib/types';
import { formatCurrency } from '@/lib/pricing';

export default function StepConfirmation({
  booking,
  packages,
  onClose,
}: {
  booking: BookingState;
  packages: Package[];
  onClose: () => void;
}) {
  const chosen = packages.filter((p) => booking.selectedPackages.includes(p.id));

  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-apex">
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
          <path d="M1 8L7 14L19 1" stroke="#D4001A" strokeWidth="2" />
        </svg>
      </div>

      <h3 className="mt-6 font-display text-2xl font-bold">You&rsquo;re booked in.</h3>
      <p className="mt-2 text-sm text-smoke/50">
        A confirmation has been sent — we&rsquo;ll see you and the{' '}
        {booking.vehicle.make} {booking.vehicle.model} soon.
      </p>

      <div className="glass-panel mx-auto mt-8 max-w-sm rounded-md p-6 text-left font-mono text-sm">
        <Row label="Vehicle" value={`${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`} />
        <Row label="Services" value={chosen.map((s) => s.name).join(', ')} />
        <Row label="Date" value={booking.date ?? '—'} />
        <Row label="Time" value={booking.time ?? '—'} />
        <div className="hairline my-3" />
        <Row
          label="Paid Today"
          value={formatCurrency(
            booking.depositOnly ? booking.estimate?.depositRequired ?? 0 : booking.estimate?.estimatedPrice ?? 0
          )}
        />
      </div>

      <button onClick={onClose} className="btn-apex mt-8">
        Done
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex justify-between gap-4">
      <span className="text-[11px] uppercase tracking-widest2 text-smoke/50">{label}</span>
      <span className="text-right text-white/90">{value}</span>
    </div>
  );
}
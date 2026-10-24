'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The trip log: the GPS tracker, "Log a trip", and the year's trips with
// Edit / Recalculate / Delete. The page (server) does every total; this only
// lists and edits.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, EmptyState, buttonClass } from '@/components/ui';
import type { Trip } from '@/lib/models';
import TripEditor, { TripDraft, VehicleOption } from './TripEditor';
import GpsTripTracker from './GpsTripTracker';

const SOURCE_LABEL: Record<Trip['source'], string> = {
  route: 'Map route',
  odometer: 'Odometer',
  manual: 'Typed',
  gps: 'GPS',
};

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

export default function TripLog({
  trips,
  vehicles,
  baseAddress,
  exportHref,
  exportLabel,
}: {
  trips: Trip[];
  vehicles: VehicleOption[];
  baseAddress: string;
  exportHref: string;
  exportLabel: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState<TripDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const vehicleName = new Map(vehicles.map((v) => [v.id, v.description]));

  async function act(id: string, url: string, method: string) {
    setBusy(id);
    setError('');
    try {
      const res = await fetch(url, { method });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error ?? 'That did not work.');
      router.refresh();
    } catch {
      setError('We could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <GpsTripTracker onFinish={(draft) => setAdding(draft)} />
        <div className="flex flex-wrap gap-2">
          {!adding && (
            <button type="button" className={buttonClass('primary', 'sm')} onClick={() => setAdding({})}>
              + Log a trip
            </button>
          )}
          <a href={exportHref} className={buttonClass('secondary', 'sm')}>
            {exportLabel}
          </a>
        </div>
      </div>

      {adding && (
        <TripEditor vehicles={vehicles} baseAddress={baseAddress} draft={adding} onDone={() => setAdding(null)} />
      )}

      {trips.length === 0 ? (
        <EmptyState
          title="No trips yet"
          description="Completed mobile jobs log their round trip here automatically. Log supply runs, car shows and prospecting by hand."
        />
      ) : (
        <ul className="divide-y divide-white/5 rounded-sm border border-white/10">
          {trips.map((t) =>
            editing === t.id ? (
              <li key={t.id} className="p-3">
                <TripEditor vehicles={vehicles} baseAddress={baseAddress} trip={t} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-muted">{usDate(t.tripDate)}</span>
                    <span className="text-sm text-white">{t.purpose}</span>
                  </div>
                  {(t.startAddress || t.stops.length > 0 || t.endAddress) && (
                    <p className="mt-1 text-[12px] leading-snug text-subtle">
                      {[t.startAddress, ...t.stops.map((s) => s.label || s.address), t.endAddress].filter(Boolean).join(' → ')}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{SOURCE_LABEL[t.source]}</Badge>
                    <Badge tone={t.businessVehicleId ? 'info' : 'warning'}>
                      {t.businessVehicleId ? (vehicleName.get(t.businessVehicleId) ?? 'Vehicle') : 'No vehicle'}
                    </Badge>
                    {t.needsReview && <Badge tone="warning">Needs review</Badge>}
                    {t.odometerStartKey && (
                      <a href={`/api/files/${t.odometerStartKey}`} target="_blank" rel="noreferrer" className="text-[11px] text-sky-400 underline">
                        start photo
                      </a>
                    )}
                    {t.odometerEndKey && (
                      <a href={`/api/files/${t.odometerEndKey}`} target="_blank" rel="noreferrer" className="text-[11px] text-sky-400 underline">
                        end photo
                      </a>
                    )}
                  </div>
                  {t.needsReview && t.reviewReason && <p className="mt-1.5 text-[12px] text-amber-300">{t.reviewReason}</p>}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end">
                  <span className="font-display text-lg font-bold text-white">
                    {t.milesTenths === null ? '—' : (t.milesTenths / 10).toFixed(1)}{' '}
                    <span className="text-[12px] font-normal text-muted">mi</span>
                  </span>
                  <div className="flex flex-wrap justify-end gap-1">
                    <button type="button" className={buttonClass('ghost', 'sm')} disabled={!!busy} onClick={() => setEditing(t.id)}>
                      Edit
                    </button>
                    {t.source === 'route' && (
                      <button
                        type="button"
                        className={buttonClass('ghost', 'sm')}
                        disabled={!!busy}
                        onClick={() => act(t.id, `/api/mileage/trips/${t.id}/recalculate`, 'POST')}
                      >
                        {busy === t.id ? 'Looking up…' : 'Recalculate'}
                      </button>
                    )}
                    <button
                      type="button"
                      className={buttonClass('ghost', 'sm')}
                      disabled={!!busy}
                      onClick={() => {
                        if (confirm('Delete this trip? This cannot be undone.')) act(t.id, `/api/mileage/trips/${t.id}`, 'DELETE');
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

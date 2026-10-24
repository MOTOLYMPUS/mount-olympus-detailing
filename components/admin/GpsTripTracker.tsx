'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Start trip / Stop trip — measure a drive with the phone's GPS.
//
// FOREGROUND ONLY. A web app cannot track location in the background: on an
// iPhone (Safari or the home-screen PWA) GPS updates stop the moment the app
// is switched away from or the screen locks, and Android Chrome throttles them
// too. So this keeps the screen awake (Wake Lock, where supported), saves its
// progress in localStorage, and, if the app was closed mid-drive, bridges the
// gap with the straight-line distance and says so in the trip notes. For a
// long drive, odometer readings are the more reliable record.
//
// Distance is the sum of hops between fixes, ignoring fixes worse than 50 m
// accuracy and hops under 15 m (GPS jitter while parked).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Alert, buttonClass } from '@/components/ui';
import type { TripDraft } from './TripEditor';

const STORE = 'mileage.gps-trip';
const MAX_ACCURACY_M = 50;
const MIN_HOP_M = 15;
const METERS_PER_MILE = 1609.344;

interface TrackState {
  startedAt: string;
  meters: number;
  last: { lat: number; lon: number; at: number } | null;
  gaps: number;
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function load(): TrackState | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as TrackState) : null;
  } catch {
    return null;
  }
}

function save(state: TrackState | null) {
  try {
    if (state) localStorage.setItem(STORE, JSON.stringify(state));
    else localStorage.removeItem(STORE);
  } catch {
    /* private mode — tracking still works for this page view */
  }
}

const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function GpsTripTracker({ onFinish }: { onFinish: (draft: TripDraft) => void }) {
  const [state, setState] = useState<TrackState | null>(null);
  const [error, setError] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const resumed = useRef(false);

  function stopWatching() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  }

  function watch() {
    if (!('geolocation' in navigator)) {
      setError('This browser cannot share its location.');
      return;
    }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (wakeLock.current = l)).catch(() => undefined);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setAccuracy(Math.round(pos.coords.accuracy));
        if (pos.coords.accuracy > MAX_ACCURACY_M) return;
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: pos.timestamp };
        setState((prev) => {
          if (!prev) return prev;
          if (!prev.last) {
            const next = { ...prev, last: here };
            save(next);
            return next;
          }
          const hop = haversine(prev.last, here);
          if (hop < MIN_HOP_M) return prev;
          // A fix more than two minutes after the last one means the app was
          // backgrounded: count the straight line and note the gap.
          const gap = here.at - prev.last.at > 120_000 ? 1 : 0;
          const next = { ...prev, meters: prev.meters + hop, last: here, gaps: prev.gaps + gap };
          save(next);
          return next;
        });
      },
      (err) => setError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
  }

  // Pick a trip back up after a reload or after the app was reopened.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const saved = load();
    if (saved) {
      setState(saved);
      watch();
    }
    return stopWatching;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start() {
    setError('');
    const next: TrackState = { startedAt: new Date().toISOString(), meters: 0, last: null, gaps: 0 };
    save(next);
    setState(next);
    watch();
  }

  function stop() {
    stopWatching();
    const s = state;
    save(null);
    setState(null);
    setAccuracy(null);
    if (!s) return;
    const started = new Date(s.startedAt);
    const notes = [
      `GPS tracked from ${started.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} to ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
      s.gaps ? `app was closed ${s.gaps} time(s) - straight-line distance used for those gaps` : '',
    ]
      .filter(Boolean)
      .join('; ');
    onFinish({ tripDate: localDate(s.startedAt), source: 'gps', miles: (s.meters / METERS_PER_MILE).toFixed(1), notes });
  }

  function discard() {
    if (!confirm('Discard this tracked trip?')) return;
    stopWatching();
    save(null);
    setState(null);
    setAccuracy(null);
  }

  if (!state) {
    return (
      <div className="space-y-2">
        {error && <Alert tone="danger">{error}</Alert>}
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={start}>
          ▶ Start trip (GPS)
        </button>
        <p className="text-[12px] leading-snug text-subtle">
          Keep the app open on screen while you drive. Phones stop web-app GPS in the background or when
          the screen locks — iPhones always do — so for long drives, odometer readings are more reliable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="font-mono text-[11px] uppercase tracking-widest2 text-emerald-300">Trip in progress</p>
      <p className="font-display text-3xl font-bold text-white">
        {(state.meters / METERS_PER_MILE).toFixed(1)} <span className="text-base font-normal text-muted">mi</span>
      </p>
      <p className="text-[12px] text-subtle">
        Started {new Date(state.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        {accuracy !== null ? ` · GPS ±${accuracy} m` : ' · waiting for GPS…'}
        {state.gaps ? ` · ${state.gaps} gap(s) while the app was closed` : ''}
      </p>
      <div className="flex gap-2">
        <button type="button" className={buttonClass('primary', 'sm')} onClick={stop}>
          ■ Stop trip
        </button>
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={discard}>
          Discard
        </button>
      </div>
    </div>
  );
}

'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Slim, always-mounted banner reflecting navigator.onLine. Collapses to
// zero height rather than unmounting, so its appearance/disappearance is a
// height transition instead of a layout jump — disabled entirely under
// prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import clsx from 'clsx';

export default function OfflineBanner() {
  // Assume online for the very first paint (server render has no
  // navigator.onLine at all) — the common case never sees a flash, and
  // useEffect corrects it immediately on mount if the assumption was wrong.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'fixed inset-x-0 top-0 z-[80] overflow-hidden transition-[max-height,opacity] duration-300 ease-apex motion-reduce:transition-none',
        online ? 'pointer-events-none max-h-0 opacity-0' : 'max-h-12 opacity-100'
      )}
    >
      <p className="bg-apex px-4 py-2 text-center font-mono text-[11px] uppercase tracking-widest2 text-white">
        You&rsquo;re offline — showing saved data
      </p>
    </div>
  );
}

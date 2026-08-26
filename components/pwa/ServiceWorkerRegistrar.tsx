'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Registers public/sw.js and surfaces exactly one thing to the user: when a
// new version has installed and is waiting to take over, so they can apply it
// on their own terms instead of a background switch yanking assets out from
// under an in-progress page.
//
// Renders nothing until there's an update to offer — this is a side-effect
// component, not a visible one, in the common case.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { buttonClass } from '@/components/ui';

export default function ServiceWorkerRegistrar() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  // A ref, not state: this guards a one-time action (reload), not something
  // that should ever cause a re-render itself.
  const reloadedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    function watchForWaitingWorker(reg: ServiceWorkerRegistration) {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // A worker reaching "installed" while a controller already exists
        // means this is an *update* to a page that's already running one —
        // not the very first install (which also passes through "installed",
        // but with no prior controller to replace, so nothing to prompt for).
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          setWaitingWorker(installing);
        }
      });
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(reg.waiting);
        }
        reg.addEventListener('updatefound', () => watchForWaitingWorker(reg));
      })
      .catch((err) => {
        console.error('[pwa] service worker registration failed', err);
      });

    function handleControllerChange() {
      // Fires when the waiting worker calls skipWaiting() and takes control.
      // Reload exactly once per page-load to pick up the new assets — guarded
      // by the ref (not state) so a second, unexpected controllerchange event
      // can never start a reload loop.
      if (reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    setWaitingWorker(null);
  }, [waitingWorker]);

  if (!waitingWorker) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 sm:justify-end sm:pr-6"
    >
      <div className="flex max-w-sm items-center gap-3 rounded-sm border border-white/10 bg-charcoal/95 p-4 shadow-glass backdrop-blur-xs">
        <p className="flex-1 text-[13px] text-white">A new version of the app is ready.</p>
        <button type="button" onClick={applyUpdate} className={buttonClass('primary', 'sm')}>
          Refresh
        </button>
      </div>
    </div>
  );
}

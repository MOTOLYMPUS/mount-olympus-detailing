'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Polling with a Page Visibility back-off.
//
// There is NO WebSocket server in this app — it is a Next.js app on a single
// node with no separate realtime process — so new messages arrive by polling.
// That is a real limitation, not a design preference; see the report notes.
//
// The back-off is what keeps it honest: a background tab polls far less often
// than a focused one, so a laptop with the app pinned in a tab all day is not
// firing a request every few seconds forever. Returning to the tab polls
// immediately, so the delay is never *felt* — you only ever wait while you are
// not looking.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';

export const ACTIVE_INTERVAL_MS = 8_000;
export const HIDDEN_INTERVAL_MS = 60_000;

export function usePolling(callback: () => void, enabled = true): void {
  // Held in a ref so changing the callback (it closes over state on every
  // render) does not tear down and restart the timer each time.
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      saved.current();
      schedule();
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(
        tick,
        document.visibilityState === 'hidden' ? HIDDEN_INTERVAL_MS : ACTIVE_INTERVAL_MS
      );
    };

    const onVisibility = () => {
      // Coming back to the tab refreshes at once, then resumes the fast cadence.
      if (document.visibilityState === 'visible') tick();
      else schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}

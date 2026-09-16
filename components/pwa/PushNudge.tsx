'use client';

// ─────────────────────────────────────────────────────────────────────────────
// One-tap enrolment banner shown inside the app when the account WANTS push
// (the default) but this device is not enrolled yet.
//
// Browsers only show the permission prompt from a user gesture, so an account
// preference alone cannot turn notifications on — the "Turn on" tap here is
// that gesture. Shown only where it can actually work (not on iOS in a
// browser tab, not where notifications are blocked). "Not now" hides it for
// the session; the customer turns the preference off for good in Profile.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui';
import { hasPushSubscription, pushSupport, subscribePush } from '@/lib/push-client';

const DISMISS_KEY = 'mod.push-nudge.dismissed';

export default function PushNudge({ optIn }: { optIn: boolean }) {
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!optIn) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* storage unavailable — just show it */
    }
    if (pushSupport() !== 'ready') return;
    let cancelled = false;
    hasPushSubscription().then((has) => {
      if (!cancelled && !has) setShow(true);
    });
    return () => {
      cancelled = true;
    };
  }, [optIn]);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  async function turnOn() {
    setPending(true);
    const result = await subscribePush();
    setPending(false);
    // Whatever happened, do not keep asking this session: 'on' means done,
    // 'denied' means the browser will not prompt again, anything else the
    // customer can retry from Profile.
    dismiss();
    void result;
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Turn on notifications"
      className="mx-auto mb-4 flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 rounded-sm border border-apex/40 bg-apex/10 px-4 py-3 text-[13px] text-white"
    >
      <p className="min-w-0 flex-1">
        Get a heads-up when a booking is confirmed, moved, or your vehicle is ready.
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={dismiss} className="px-2 py-1.5 text-muted hover:text-white">
          Not now
        </button>
        <button type="button" disabled={pending} onClick={turnOn} className={buttonClass('primary', 'sm')}>
          {pending ? 'Turning on…' : 'Turn on'}
        </button>
      </div>
    </div>
  );
}

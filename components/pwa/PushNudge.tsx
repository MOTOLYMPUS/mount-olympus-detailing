'use client';

// ─────────────────────────────────────────────────────────────────────────────
// One-tap enrolment banner shown inside the app when the account WANTS push
// (the default) but this device is not enrolled yet.
//
// Browsers only show the permission prompt from a user gesture, so an account
// preference alone cannot turn notifications on — the "Turn on" tap here is
// that gesture.
//
// WHEN IT STAYS HIDDEN (each of these was a way it nagged uselessly):
//   • push is not supported here, blocked, or iOS outside the installed app;
//   • the SERVER has no push keys yet — a tap could never succeed, so asking
//     is pointless (checked via /api/push/vapid);
//   • this device is already enrolled;
//   • the customer tapped "Not now", or a tap failed, within the last 14 days
//     (localStorage, so it survives the installed app being relaunched — a
//     session-only memory meant every launch asked again).
// The permanent off switch is the account preference in Profile.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui';
import { hasPushSubscription, pushSupport, subscribePush } from '@/lib/push-client';

const SNOOZE_KEY = 'mod.push-nudge.snoozed-until';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

function snooze(ms = SNOOZE_MS) {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms));
  } catch {
    /* storage unavailable — it will simply ask again next time */
  }
}

export default function PushNudge({ optIn }: { optIn: boolean }) {
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!optIn || snoozed() || pushSupport() !== 'ready') return;
    let cancelled = false;
    (async () => {
      if (await hasPushSubscription()) return;
      // Only ask when a tap can actually succeed.
      const vapid = await fetch('/api/push/vapid')
        .then((r) => r.json())
        .catch(() => null);
      if (!vapid?.ok || !vapid.configured) return;
      if (!cancelled) setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [optIn]);

  function dismiss() {
    snooze();
    setShow(false);
  }

  async function turnOn() {
    setPending(true);
    const result = await subscribePush();
    setPending(false);
    // 'on': enrolled, the subscription check hides this from now on. Anything
    // else: do not ask again for a while — the customer can finish in Profile.
    if (result !== 'on') snooze();
    setShow(false);
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

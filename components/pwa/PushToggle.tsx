'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Push-notification opt-in/out toggle for Settings (app/app/profile).
//
// Flow to turn on: ask Notification permission → fetch the VAPID public key
// from GET /api/push/vapid → PushManager.subscribe() with it as the
// applicationServerKey → POST the resulting subscription to
// /api/push/subscribe. Every step degrades to an explanatory message rather
// than a dead button — unsupported browser, iOS not installed to the home
// screen, push not configured server-side, or permission already denied are
// all distinct, named states below.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui';

type Status =
  | 'checking'
  | 'unsupported'
  | 'ios-not-installed'
  | 'not-configured'
  | 'denied'
  | 'off'
  | 'on';

/** `applicationServerKey` must be a Uint8Array — the API returns it base64url-encoded. */
function base64urlToUint8Array(value: string): Uint8Array {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIosDevice(): boolean {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function PushToggle() {
  const [status, setStatus] = useState<Status>('checking');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const evaluate = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    // iOS/iPadOS Safari only supports web push for a PWA added to the home
    // screen (16.4+) — inside the regular browser tab, Notification.requestPermission
    // exists but push silently cannot work, so this is checked before anything else.
    if (isIosDevice() && !isStandaloneDisplay()) {
      setStatus('ios-not-installed');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setStatus(existing ? 'on' : 'off');
    } catch (e) {
      console.error('[push] could not read subscription state', e);
      setStatus('off');
    }
  }, []);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  const enable = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const vapidRes = await fetch('/api/push/vapid');
      const vapidData = await vapidRes.json().catch(() => ({}));
      if (!vapidRes.ok || !vapidData.ok || !vapidData.configured) {
        setStatus('not-configured');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true, // required by the spec — every push must show a visible notification
        // Node 24's lib types make Uint8Array generic over ArrayBufferLike,
        // which the DOM BufferSource union no longer accepts directly without
        // a cast — same underlying mismatch as the Buffer/BodyInit fix in
        // lib/push.ts and app/api/files/[...key]/route.ts.
        applicationServerKey: base64urlToUint8Array(vapidData.publicKey) as BufferSource,
      });

      const json = subscription.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not save your subscription.');
        return;
      }

      setStatus('on');
    } catch (e) {
      console.error('[push] enabling push failed', e);
      setError('Something went wrong turning on notifications.');
    } finally {
      setPending(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {
          // Best-effort — the browser-side unsubscribe already succeeded, so
          // the user's intent is honored even if this cleanup call fails; a
          // stale server-side row just means one wasted push attempt later,
          // handled gracefully by lib/push.ts marking it gone on the next try.
        });
      }
      setStatus('off');
    } catch (e) {
      console.error('[push] disabling push failed', e);
      setError('Something went wrong turning off notifications.');
    } finally {
      setPending(false);
    }
  }, []);

  return (
    <div aria-live="polite" className="space-y-3">
      {error && (
        <p className="text-[13px] text-flare" role="alert">
          {error}
        </p>
      )}

      {status === 'checking' && <p className="text-[13px] text-subtle">Checking notification support…</p>}

      {status === 'unsupported' && (
        <p className="text-[13px] text-subtle">Push notifications aren&rsquo;t supported in this browser.</p>
      )}

      {status === 'ios-not-installed' && (
        <p className="text-[13px] leading-relaxed text-subtle">
          On iPhone/iPad, add this app to your Home Screen first (Share → Add to Home Screen) — iOS only
          supports push notifications for installed apps (16.4 or later).
        </p>
      )}

      {status === 'not-configured' && (
        <p className="text-[13px] text-subtle">Push notifications aren&rsquo;t set up for this app yet.</p>
      )}

      {status === 'denied' && (
        <p className="text-[13px] leading-relaxed text-subtle">
          Notifications are blocked for this site. To re-enable them, open this site&rsquo;s permissions in
          your browser settings, allow notifications, then reload the page.
        </p>
      )}

      {status === 'off' && (
        <button type="button" disabled={pending} onClick={enable} className={buttonClass('primary', 'sm')}>
          {pending ? 'Turning on…' : 'Enable push notifications'}
        </button>
      )}

      {status === 'on' && (
        <div className="flex items-center gap-3">
          <p className="text-[13px] text-muted">Push notifications are on.</p>
          <button type="button" disabled={pending} onClick={disable} className={buttonClass('secondary', 'sm')}>
            {pending ? 'Turning off…' : 'Turn off'}
          </button>
        </div>
      )}
    </div>
  );
}

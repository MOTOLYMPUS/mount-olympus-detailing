'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Browser-side push enrolment, shared by the sign-up form, the in-app nudge,
// and the Profile toggle so all three behave identically.
//
// WHY THIS CANNOT BE FULLY AUTOMATIC: browsers only show the notification
// permission prompt in response to a user gesture (a tap or click), and iOS
// only supports web push at all once the app is installed to the Home Screen
// (16.4+). So "on by default" is a stored PREFERENCE (users.push_opt_in,
// default true) plus the app asking for the one tap it needs at the first
// sensible moment: the sign-up submit, or a small banner inside the app. The
// customer can turn the preference off in Profile at any time.
// ─────────────────────────────────────────────────────────────────────────────

export type PushSupport = 'unsupported' | 'ios-not-installed' | 'denied' | 'ready';

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

/** What this browser can do right now. Safe to call during render on the client. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  // iOS/iPadOS Safari only supports web push for a PWA added to the home
  // screen — inside the regular browser tab Notification.requestPermission
  // exists but push silently cannot work.
  if (isIosDevice() && !isStandaloneDisplay()) return 'ios-not-installed';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

export async function hasPushSubscription(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export type SubscribeResult = 'on' | 'denied' | 'dismissed' | 'not-configured' | 'error';

/**
 * Ask permission (if not yet granted) and register this browser with the
 * server. MUST be called from a user gesture the first time, or the browser
 * will not show the permission prompt.
 */
export async function subscribePush(): Promise<SubscribeResult> {
  try {
    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'dismissed';

    const vapidRes = await fetch('/api/push/vapid');
    const vapidData = await vapidRes.json().catch(() => ({}));
    if (!vapidRes.ok || !vapidData.ok || !vapidData.configured) return 'not-configured';

    const reg = await navigator.serviceWorker.ready;
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Node 24's lib types make Uint8Array generic over ArrayBufferLike,
        // which the DOM BufferSource union no longer accepts without a cast.
        applicationServerKey: base64urlToUint8Array(vapidData.publicKey) as BufferSource,
      }));

    const json = subscription.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok ? 'on' : 'error';
  } catch (e) {
    console.error('[push] subscribe failed', e);
    return 'error';
  }
}

/** Unregister this browser. Best-effort on the server side. */
export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {
    // The browser-side unsubscribe already succeeded, so the user's intent is
    // honoured; a stale server row costs one failed push attempt later, which
    // lib/push.ts cleans up.
  });
}

/** Persist the preference on the account (users.push_opt_in). */
export async function setPushOptIn(value: boolean): Promise<void> {
  await fetch('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'setPushOptIn', pushOptIn: value }),
  }).catch(() => {});
}

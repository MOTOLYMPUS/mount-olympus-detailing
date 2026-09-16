'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Push-notification toggle for Profile.
//
// Two things are tracked and shown together:
//   • the account PREFERENCE (users.push_opt_in — on by default for every
//     new account), which is what the customer is really switching here;
//   • whether THIS browser is actually enrolled (a push subscription exists),
//     which needs the browser's permission prompt and, on iOS, the app to be
//     installed to the Home Screen.
//
// "Turn off" clears both: the preference (so the in-app nudge stops asking)
// and this browser's subscription. "Turn on" sets the preference and enrols
// this browser. All the browser work lives in lib/push-client.ts, shared with
// the sign-up form and the in-app nudge so the three never drift.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui';
import {
  hasPushSubscription,
  pushSupport,
  setPushOptIn,
  subscribePush,
  unsubscribePush,
  type PushSupport,
} from '@/lib/push-client';

type Status = 'checking' | PushSupport | 'not-configured' | 'off' | 'on';

export default function PushToggle({ optIn }: { optIn: boolean }) {
  const [wants, setWants] = useState(optIn);
  const [status, setStatus] = useState<Status>('checking');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const evaluate = useCallback(async () => {
    const support = pushSupport();
    if (support !== 'ready') {
      setStatus(support);
      return;
    }
    setStatus((await hasPushSubscription()) ? 'on' : 'off');
  }, []);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  const enable = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      await setPushOptIn(true);
      setWants(true);
      const result = await subscribePush();
      if (result === 'on') setStatus('on');
      else if (result === 'denied') setStatus('denied');
      else if (result === 'not-configured') setStatus('not-configured');
      else if (result === 'error') setError('Something went wrong turning on notifications.');
      else setStatus('off');
    } finally {
      setPending(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      await setPushOptIn(false);
      setWants(false);
      await unsubscribePush();
      setStatus(pushSupport() === 'ready' ? 'off' : pushSupport());
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

      <p className="text-[13px] text-muted">
        Notifications are{' '}
        <span className="text-white">{wants ? 'on' : 'off'}</span> for your account.
        {wants && status === 'on' && ' This device will receive them.'}
        {wants && status === 'off' && ' This device is not set up yet.'}
      </p>

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

      <div className="flex flex-wrap items-center gap-3">
        {(status === 'off' || (!wants && status !== 'checking')) && (
          <button type="button" disabled={pending} onClick={enable} className={buttonClass('primary', 'sm')}>
            {pending ? 'Turning on…' : wants ? 'Set up this device' : 'Turn on notifications'}
          </button>
        )}
        {wants && (
          <button type="button" disabled={pending} onClick={disable} className={buttonClass('secondary', 'sm')}>
            {pending ? 'Turning off…' : 'Turn off'}
          </button>
        )}
      </div>
    </div>
  );
}

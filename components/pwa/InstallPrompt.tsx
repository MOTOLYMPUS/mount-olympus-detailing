'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Install-to-home-screen prompt.
//
// Two call sites, two personalities, same detection logic:
//   variant="floating" — an unsolicited toast (mounted globally). Dismissible;
//     remembers the dismissal in localStorage so it never nags twice.
//   variant="inline"   — a permanent card inside Settings (app/app/profile).
//     The user navigated here on purpose, so there's no dismiss control and
//     no localStorage suppression — it simply reflects install availability.
//
// iOS Safari never fires `beforeinstallprompt` (Apple has no equivalent
// API) — the only way to "prompt" install there is instructions for the
// user to do it themselves via the Share sheet, so iOS gets a fully
// different render branch, not a disabled button.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'mod-install-prompt-dismissed';

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Non-standard but the only signal iOS Safari offers for "already added
    // to the home screen".
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosDevice(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ identifies as "Macintosh" in the UA string; touch points is
  // what actually distinguishes an iPad from a real Mac.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** Apple's Share-sheet glyph — an upward arrow escaping a box — so the instruction below reads as "tap ⬆︎ this". */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block shrink-0 align-[-2px]"
    >
      <path d="M12 3v13" />
      <path d="M7 8l5-5 5 5" />
      <rect x="4" y="12" width="16" height="9" rx="2" />
    </svg>
  );
}

export default function InstallPrompt({ variant = 'floating' }: { variant?: 'inline' | 'floating' }) {
  // Nothing about platform, standalone state, or an install prompt can be
  // known during SSR (no `window`) — `ready` gates the real content behind a
  // small, honest placeholder for that first pass instead of guessing.
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setIos(isIosDevice());
    if (variant === 'floating') {
      try {
        setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
      } catch {
        // Private browsing in some browsers throws on localStorage access —
        // fail open (never dismissed) rather than crash the toast.
      }
    }
    setReady(true);

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault(); // stop the browser's own mini-infobar so *we* control when/how it's offered
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [variant]);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice; // outcome (accepted/dismissed) — either way the browser won't offer this same deferred event again
    if (variant === 'floating') {
      try {
        localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* see above */
      }
    }
    setDeferred(null);
  }, [deferred, variant]);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* see above */
    }
    setDismissed(true);
  }, []);

  // ── Gating ──
  if (!ready) {
    // Something sensible for the SSR/pre-hydration pass: the inline variant
    // lives inside a Settings card that always has a heading above it, so an
    // empty card reads as broken — a neutral placeholder fills that gap. The
    // floating variant is an unsolicited toast; showing nothing until we
    // actually know whether to offer it is the correct behavior, not a gap.
    if (variant === 'inline') {
      return <p className="text-[13px] text-subtle">Checking install availability on this device…</p>;
    }
    return null;
  }

  if (standalone || installed) {
    return variant === 'inline' ? (
      <p className="text-[13px] text-muted">The app is already installed on this device.</p>
    ) : null;
  }

  if (variant === 'floating' && dismissed) return null;
  if (!deferred && !ios) {
    // Nothing to offer: not iOS (so no Share-sheet instructions apply), and
    // the browser hasn't fired beforeinstallprompt — either it doesn't
    // support installability at all, or already decided not to offer it yet.
    return variant === 'inline' ? (
      <p className="text-[13px] text-subtle">
        This browser doesn&rsquo;t support installing this app right now.
      </p>
    ) : null;
  }

  const body = ios ? (
    <p className="text-[13px] leading-relaxed text-muted">
      Tap <ShareGlyph /> <strong className="text-white">Share</strong>, then{' '}
      <strong className="text-white">Add to Home Screen</strong>.
    </p>
  ) : (
    <p className="text-[13px] leading-relaxed text-muted">
      Install the app for quick access and offline support.
    </p>
  );

  const action = !ios && deferred && (
    <button type="button" onClick={handleInstall} className={buttonClass('primary', 'sm')}>
      Install app
    </button>
  );

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-sm">{body}</div>
        {action}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 sm:justify-end sm:pr-6"
    >
      <div className="flex max-w-sm items-start gap-3 rounded-sm border border-white/10 bg-charcoal/95 p-4 shadow-glass backdrop-blur-xs">
        <div className="flex-1">
          <p className="mb-1 font-display text-sm font-semibold text-white">Install Mount Olympus Detailing</p>
          {body}
          {action && <div className="mt-3">{action}</div>}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-sm p-1 text-subtle hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

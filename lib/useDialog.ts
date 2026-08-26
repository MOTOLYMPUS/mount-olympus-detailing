'use client';

import { RefObject, useEffect, useRef, useState } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Makes a dialog keyboard-accessible: Escape to close, Tab confined inside,
 * focus moved in on open and restored to the trigger on close, and the page
 * behind it locked from scrolling.
 *
 * The original booking modal had none of this — keyboard users could tab
 * straight out into the inert page behind and had no way to dismiss it.
 */
export function useDialog(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement>
) {
  const restoreTo = useRef<HTMLElement | null>(null);

  // Remember the trigger so focus can go back to it on close.
  useEffect(() => {
    if (open) restoreTo.current = document.activeElement as HTMLElement | null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    // Move focus into the dialog. Prefer the first real control; fall back to
    // the container itself (which carries tabIndex={-1}).
    const first = container.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? container).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;

      // Wrap in both directions, and pull focus back in if it has escaped.
      if (e.shiftKey && (active === firstEl || !container.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !container.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, containerRef]);
}

/**
 * Respects the OS "reduce motion" setting.
 *
 * Needed because the CSS override in globals.css only neutralises CSS
 * transitions — Framer Motion animates via inline styles and is unaffected by
 * it, so the hero zoom played regardless of the user's preference.
 *
 * Starts false so server and client render identically, then updates after
 * hydration and stays subscribed to changes.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

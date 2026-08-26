'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Scroll-triggered reveal.
//
// One IntersectionObserver instance shared by every element on the page, not
// one per element. With ~60 revealed sections across the marketing site, a
// per-element observer means 60 observers each doing their own intersection
// bookkeeping; a single shared one is measurably cheaper and is the difference
// between smooth and janky scrolling on a mid-range phone.
//
// The actual animation lives in globals.css (`[data-reveal]` /
// `[data-revealed]`). This file only decides WHEN to flip the attribute, which
// means:
//   • the markup renders server-side with no JS,
//   • prefers-reduced-motion is handled by CSS, not by a hook, and
//   • if this script fails to load, the `@media (scripting: none)` rule and the
//     unobserved fallback below still show the content.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import clsx from 'clsx';

type RevealDirection = 'up' | 'left' | 'right' | 'scale';

let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null;
  if (observer) return observer;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;

        // A per-element delay staggers a grid without needing a timer per card.
        const delay = Number(el.dataset.revealDelay ?? 0);
        if (delay > 0) {
          el.style.transitionDelay = `${delay}ms`;
        }
        el.dataset.revealed = 'true';

        // Reveal is one-way. Un-revealing on scroll-up makes a page feel
        // twitchy and re-runs the animation every time someone scrolls back.
        observer?.unobserve(el);
      }
    },
    {
      // Fire slightly before the element reaches the viewport so the animation
      // is already running by the time it is genuinely visible.
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.08,
    }
  );

  return observer;
}

export default function Reveal({
  children,
  direction = 'up',
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  direction?: RevealDirection;
  /** Milliseconds. Use to stagger siblings — 60–90ms per item reads well. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li' | 'header' | 'aside';
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = getObserver();
    if (!io) {
      // No IntersectionObserver (very old browser): show it immediately rather
      // than leaving it invisible forever.
      el.dataset.revealed = 'true';
      return;
    }

    // Already on screen at mount — e.g. an above-the-fold section, or a
    // client-side navigation landing mid-page. Reveal without waiting for a
    // scroll event that may never come.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.dataset.revealed = 'true';
      return;
    }

    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-reveal={direction === 'up' ? '' : direction}
      data-reveal-delay={delay || undefined}
      className={clsx(className)}
    >
      {children}
    </Tag>
  );
}

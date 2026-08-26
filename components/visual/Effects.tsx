'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Small interactive effects: parallax, pointer spotlight, floating motes,
// animated counters, tilt, and the mountain silhouette.
//
// Collected in one file because they share the same two rules and it is easier
// to keep them honest side by side:
//
//   • EVERY scroll/pointer handler is rAF-throttled and passive. An unthrottled
//     scroll listener that writes to the DOM is the single most common cause of
//     a janky "premium" site — the handler fires far more often than the screen
//     refreshes and each call forces layout.
//   • EVERY effect no-ops under prefers-reduced-motion, and several also no-op
//     on touch (a pointer spotlight has nothing to follow without a pointer).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { usePrefersReducedMotion } from '@/lib/useDialog';

// ── Parallax ─────────────────────────────────────────────────────────────────

/**
 * Translates its children against the scroll direction.
 *
 * `speed` is a fraction of scroll distance: 0.15 is a background, 0.4 is
 * pronounced. Values above ~0.5 detach the element from the page and read as a
 * bug rather than depth.
 */
export function Parallax({
  children,
  speed = 0.18,
  className,
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let visible = true;

    // Stop doing work entirely while the element is off screen. A page with
    // several parallax layers otherwise recomputes all of them on every scroll
    // event regardless of whether anyone can see them.
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), {
      rootMargin: '150px',
    });
    io.observe(el);

    function update() {
      frame = 0;
      if (!el || !visible) return;
      const rect = el.getBoundingClientRect();
      // Offset from the viewport centre, so the element sits at its natural
      // position when centred and drifts either side of that.
      const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * speed;
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    }

    function onScroll() {
      // Coalesce: many scroll events, at most one write per frame.
      if (!frame) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [speed, reduced]);

  return (
    <div ref={ref} className={clsx('will-change-transform', className)} aria-hidden="true">
      {children}
    </div>
  );
}

// ── Pointer spotlight ────────────────────────────────────────────────────────

/**
 * A soft glow that tracks the cursor across the parent element.
 *
 * Writes two CSS custom properties rather than inline `left`/`top`. The
 * properties feed a radial-gradient, so the browser repaints one composited
 * layer instead of relaying out the element on every pointer move.
 */
export function Spotlight({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    // No pointer, no spotlight. Also skips the listener cost on phones.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    function apply() {
      frame = 0;
      if (!el) return;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
    }

    function onMove(e: PointerEvent) {
      const rect = parent!.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(apply);
    }

    function onEnter() {
      if (el) el.style.opacity = '1';
    }
    function onLeave() {
      if (el) el.style.opacity = '0';
    }

    parent.addEventListener('pointermove', onMove, { passive: true });
    parent.addEventListener('pointerenter', onEnter);
    parent.addEventListener('pointerleave', onLeave);
    return () => {
      parent.removeEventListener('pointermove', onMove);
      parent.removeEventListener('pointerenter', onEnter);
      parent.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return <div ref={ref} className={clsx('layer spotlight opacity-0', className)} aria-hidden="true" />;
}

// ── Floating motes ───────────────────────────────────────────────────────────

export type MoteKind = 'dust' | 'foam' | 'spray' | 'cloud';

const MOTE_STYLE: Record<MoteKind, { color: string; size: [number, number]; blur: string }> = {
  dust: { color: 'rgba(255,255,255,0.34)', size: [1.5, 3.5], blur: '0px' },
  // Foam and spray read as bubbles: bigger, softer, faintly rimmed.
  foam: { color: 'rgba(255,255,255,0.20)', size: [4, 13], blur: '0.5px' },
  spray: { color: 'rgba(190,220,255,0.26)', size: [2, 6], blur: '0.5px' },
  cloud: { color: 'rgba(255,255,255,0.09)', size: [30, 90], blur: '14px' },
};

/**
 * Drifting particles — dust in a detailing bay, foam during a wash, spray off
 * the water, or high cloud for aviation.
 *
 * Rendered as plain divs animated by one shared CSS keyframe. A canvas would
 * be smoother at hundreds of particles, but `count` is capped at 22 precisely
 * so that a canvas and its animation loop are never needed; at this density
 * the compositor handles it without a single frame of main-thread work.
 */
export function Motes({
  kind = 'dust',
  count = 14,
  className,
}: {
  kind?: MoteKind;
  count?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const style = MOTE_STYLE[kind];

  // Deterministic pseudo-random. Math.random() during render would produce
  // different values on the server and the client and trip a hydration
  // mismatch; this is seeded by index so both sides agree.
  const motes = useMemo(() => {
    const rand = (seed: number) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: Math.min(count, 22) }, (_, i) => {
      const r1 = rand(i + 1);
      const r2 = rand(i + 41);
      const r3 = rand(i + 97);
      const size = style.size[0] + r2 * (style.size[1] - style.size[0]);
      return {
        left: `${(r1 * 100).toFixed(2)}%`,
        bottom: `${(-15 + r3 * 55).toFixed(2)}%`,
        size: `${size.toFixed(1)}px`,
        duration: `${(11 + r2 * 16).toFixed(1)}s`,
        delay: `${(r3 * -20).toFixed(1)}s`,
        drift: `${(r1 * 46 - 23).toFixed(0)}px`,
      };
    });
  }, [count, style.size]);

  if (reduced) return null;

  return (
    <div className={clsx('layer', className)} aria-hidden="true">
      {motes.map((m, i) => (
        <span
          key={i}
          className="mote"
          style={
            {
              left: m.left,
              bottom: m.bottom,
              width: m.size,
              height: m.size,
              background: style.color,
              filter: style.blur === '0px' ? undefined : `blur(${style.blur})`,
              animationDuration: m.duration,
              animationDelay: m.delay,
              '--mote-drift': m.drift,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ── Animated counter ─────────────────────────────────────────────────────────

/**
 * Counts up when scrolled into view.
 *
 * Renders the FINAL value in the server HTML and only animates after mount, so
 * the real number is present for search engines, screen readers on first
 * paint, and anyone whose JS fails. An implementation that starts at 0 in the
 * markup ships a page that lies about its own content.
 */
export function Counter({
  to,
  duration = 1600,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}: {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let cancelled = false;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();

        const start = performance.now();
        const run = (now: number) => {
          if (cancelled) return;
          const t = Math.min(1, (now - start) / duration);
          // easeOutExpo — fast start, long settle. Reads as momentum rather
          // than a linear tick.
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          setValue(to * eased);
          if (t < 1) frame = requestAnimationFrame(run);
        };

        setValue(0);
        frame = requestAnimationFrame(run);
      },
      { threshold: 0.4 }
    );

    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [to, duration, reduced]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

// ── Tilt ─────────────────────────────────────────────────────────────────────

/**
 * Subtle 3D tilt toward the cursor. Maximum 6° — beyond that it stops reading
 * as depth and starts reading as a gimmick, and it makes text edges shimmer.
 */
export function Tilt({
  children,
  max = 6,
  className,
}: {
  children: React.ReactNode;
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let rx = 0;
    let ry = 0;

    function apply() {
      frame = 0;
      if (el) el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    }

    function onMove(e: PointerEvent) {
      const rect = el!.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      ry = px * max * 2;
      rx = -py * max * 2;
      if (!frame) frame = requestAnimationFrame(apply);
    }

    function onLeave() {
      rx = 0;
      ry = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    }

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [max, reduced]);

  return (
    <div
      ref={ref}
      className={clsx('transition-transform duration-300 ease-apex', className)}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {children}
    </div>
  );
}

// ── Mountain silhouette ──────────────────────────────────────────────────────

/**
 * Layered peaks — the brand mark, drawn as SVG so it scales to any width and
 * costs nothing to load. Three depth planes with decreasing opacity produce
 * aerial perspective, which is what makes a flat silhouette read as distance.
 */
export function Mountains({
  className,
  opacity = 0.14,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <svg
      className={clsx('pointer-events-none absolute inset-x-0 bottom-0 w-full', className)}
      viewBox="0 0 1440 260"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Furthest range */}
      <path
        d="M0 260V150l190-92 150 74 130-52 190 96 160-72 180 84 150-60 290 122v10z"
        fill="#ffffff"
        opacity={opacity * 0.32}
      />
      {/* Middle range */}
      <path
        d="M0 260V186l230-104 176 92 154-58 200 108 190-84 240 128 250-96v88z"
        fill="#ffffff"
        opacity={opacity * 0.6}
      />
      {/* Nearest range, with a single apex-red snowcap as the brand accent */}
      <path
        d="M0 260V214l260-92 210 118 180-70 240 106 260-92 290 116v-40 6z"
        fill="#ffffff"
        opacity={opacity}
      />
      <path d="M436 129l34 22-34 12-32-12z" fill="#D4001A" opacity={opacity * 2.6} />
    </svg>
  );
}

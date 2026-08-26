'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import IndustrySelector from './IndustrySelector';
import { useIndustry } from './IndustryProvider';
import { business } from '@/lib/business';

const LINKS = [
  { label: 'Services', href: '#services' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'About', href: '#about' },
  { label: 'Reviews', href: '#reviews' },
];

export default function Navbar({ onGetEstimate }: { onGetEstimate: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { config } = useIndustry();

  // Scroll awareness: transparent over the hero, glass + hairline once past it.
  //
  // rAF-throttled and passive, matching the pattern in visual/Effects.tsx. The
  // naive version — `setScrolled(window.scrollY > 24)` straight out of the
  // handler — calls setState on every one of the dozens of scroll events a
  // single wheel notch produces, and each call reads layout. Coalescing to one
  // read per frame, and bailing when the boolean has not actually flipped, means
  // this listener causes a React render exactly twice per page: once crossing
  // the threshold downward, once crossing back.
  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const next = window.scrollY > 24;
      setScrolled((prev) => (prev === next ? prev : next));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Close the mobile menu on Escape, matching the modal's behaviour.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-500 ease-apex',
        // `.glass` (one small, fixed, non-scrolling surface — the case its cost
        // is justified for) plus an opaque-enough base so the links keep their
        // measured contrast over whatever hero frame is behind them. The mobile
        // menu drops the blur for a solid panel: a full-height translucent sheet
        // over a photograph is the one place this treatment stops being legible.
        scrolled || mobileOpen ? 'glass' : 'bg-transparent'
      )}
    >
      {/* Dark base under the glass. `.glass` is a near-transparent white
          gradient — on its own the nav links would sit over a blurred but still
          bright hero and lose their measured contrast. This tint restores the
          #050505-ish backdrop the palette in tailwind.config.ts was measured
          against. It is a layer rather than a `bg-*` utility because `.glass`
          declares `background` and is defined after `@tailwind utilities`. */}
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute inset-0 -z-10 bg-obsidian/80 transition-opacity duration-500',
          scrolled || mobileOpen ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Hairline that blooms in as the bar solidifies. Its own element so it
          can fade with opacity — animating a border-colour would repaint the
          whole bar every frame of the transition. */}
      <span
        aria-hidden="true"
        className={clsx(
          'hairline-glow pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-500',
          scrolled || mobileOpen ? 'opacity-100' : 'opacity-0'
        )}
      />
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-4 lg:px-10 lg:py-5"
      >
        <a
          href="#top"
          aria-label={`${business.name} — back to top`}
          className="font-display text-[15px] font-bold tracking-tightest sm:text-lg"
        >
          {business.logo.lead} <span className="text-flare">/</span> {business.logo.tail}
        </a>

        <ul className="hidden items-center gap-8 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="font-mono text-[12px] uppercase tracking-widest2 text-muted transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-4 lg:flex">
          {/* Industry stays switchable from anywhere on the page, not just the
              hero — otherwise a visitor deep in the services grid has to scroll
              all the way back up to change mode. */}
          <IndustrySelector compact />
          <button onClick={onGetEstimate} className="btn-apex px-5 py-2.5 text-[11px]">
            Get Estimate
          </button>
        </div>

        <button
          className="flex flex-col gap-1.5 p-1 lg:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span
            className={clsx(
              'h-px w-6 bg-white transition-transform duration-300',
              mobileOpen && 'translate-y-[3.5px] rotate-45'
            )}
          />
          <span
            className={clsx(
              'h-px w-6 bg-white transition-transform duration-300',
              mobileOpen && '-translate-y-[3.5px] -rotate-45'
            )}
          />
        </button>
      </nav>

      {mobileOpen && (
        <div
          id="mobile-menu"
          className="max-h-[calc(100svh-64px)] overflow-y-auto border-t border-white/10 bg-obsidian px-6 py-6 lg:hidden"
        >
          <p className="eyebrow mb-3">Industry — currently {config.label}</p>
          <IndustrySelector compact />

          <ul className="mt-6 flex flex-col gap-5">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="font-mono text-sm uppercase tracking-widest2 text-muted"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <button
            onClick={() => {
              setMobileOpen(false);
              onGetEstimate();
            }}
            className="btn-apex mt-6 w-full"
          >
            Get Estimate
          </button>
        </div>
      )}
    </header>
  );
}

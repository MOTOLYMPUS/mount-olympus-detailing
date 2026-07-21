'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

const LINKS = [
  { label: 'Services', href: '#services' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'About', href: '#about' },
  { label: 'Reviews', href: '#reviews' },
];

export default function Navbar({ onBookNow }: { onBookNow: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-apex',
        scrolled ? 'bg-obsidian/90 backdrop-blur-md border-b border-white/10' : 'bg-transparent'
      )}
    >
      <nav className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5 lg:px-10">
        <a href="#top" className="font-display text-lg font-bold tracking-tightest">
          APEX <span className="text-apex">/</span> ATELIER
        </a>

        <ul className="hidden items-center gap-9 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="font-mono text-[12px] uppercase tracking-widest2 text-smoke/70 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden lg:block">
          <button onClick={onBookNow} className="btn-apex">
            Book Now
          </button>
        </div>

        <button
          className="flex flex-col gap-1.5 lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
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
        <div className="border-t border-white/10 bg-obsidian px-6 py-6 lg:hidden">
          <ul className="flex flex-col gap-5">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="font-mono text-sm uppercase tracking-widest2 text-smoke/80"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setMobileOpen(false);
              onBookNow();
            }}
            className="btn-apex mt-6 w-full"
          >
            Book Now
          </button>
        </div>
      )}
    </header>
  );
}

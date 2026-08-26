'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Gallery — three distinct blocks under one heading.
//
//   A. Before/after comparison slider  — real pairs only, empty state otherwise
//   B. Category-filtered mosaic        — reference photography
//   C. Lightbox dialog                 — focus-trapped, arrow-navigable
//
// ⚠️ THE HONESTY CONSTRAINT DRIVES THE LAYOUT, NOT THE OTHER WAY AROUND.
//
// data/gallery.ts ships `galleryPairs` empty on purpose: the previous build
// faked before/after by pointing at one Unsplash photo twice with a
// desaturation filter on the "before". Publishing that is a false claim about
// work performed, and for a business selling paint correction on visible
// outcomes it is exactly the claim the FTC rule on consumer reviews and
// endorsements (16 CFR Part 465) covers.
//
// So block A is built COMPLETELY — slider, keyboard control, pair switcher —
// and then renders a designed empty state instead of inventing data. The moment
// a real pair lands in the array the slider appears with no other change.
//
// Block B is captioned "Reference gallery" and every alt string describes only
// what the photograph shows. It never says "our work". That wording is load-
// bearing; do not "improve" it into a claim.
//
// LAYOUT SHIFT: every tile carries an explicit aspect-ratio class derived from
// its `shape`, so the box is reserved before the image decodes. The mosaic uses
// CSS multi-column rather than a JS masonry library for the same reason —
// nothing is measured at runtime, so nothing can reflow after paint.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import clsx from 'clsx';
import {
  GalleryCategory,
  GalleryItem,
  galleryCategories,
  galleryGrid,
  galleryPairs,
} from '@/data/gallery';
import { useDialog } from '@/lib/useDialog';
import { useIndustry } from './IndustryProvider';
import Backdrop from './visual/Backdrop';
import Reveal from './visual/Reveal';

/** Fixed boxes. Explicit ratios are the whole anti-CLS strategy for this grid. */
const SHAPE_CLASS: Record<GalleryItem['shape'], string> = {
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
  wide: 'aspect-[16/10]',
};

type Filter = 'all' | GalleryCategory;

export default function Gallery() {
  const { industry } = useIndustry();

  // ── Filter ────────────────────────────────────────────────────────────────
  // Seeded from the industry the visitor picked in the hero, so the gallery
  // opens on the work they came to look at rather than on everything at once.
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => setFilter(industry as Filter), [industry]);

  const items = useMemo(
    () => (filter === 'all' ? galleryGrid : galleryGrid.filter((g) => g.category === filter)),
    [filter]
  );

  // ── Lightbox ──────────────────────────────────────────────────────────────
  // Index into `items`, not into `galleryGrid`, so arrow keys walk the list the
  // visitor can actually see rather than jumping to a filtered-out photo.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpenIndex(null), []);

  // Escape, Tab confinement, scroll lock, and — critically — focus restored to
  // the tile that opened the dialog. lib/useDialog.ts already does all of it;
  // reimplementing any of it here would be a second, divergent copy.
  useDialog(openIndex !== null, close, panelRef);

  const step = useCallback(
    (delta: number) =>
      setOpenIndex((i) => (i === null ? i : (i + delta + items.length) % items.length)),
    [items.length]
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    };
    // Capture phase to match useDialog's own listener, so the two agree on
    // ordering rather than racing.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [openIndex, step]);

  // A filter change while the lightbox is open would leave the index pointing
  // past the end of the new list.
  useEffect(() => setOpenIndex(null), [filter]);

  const active = openIndex === null ? null : items[openIndex];

  return (
    <section id="gallery" className="relative overflow-hidden py-20 sm:py-28">
      {/* Ghosted photo + industry texture + mesh + scrim. The scrim inside
          Backdrop is what keeps the heading above 4.5:1 over the photo. */}
      <Backdrop industry={industry} intensity="subtle" />

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10">
        <Reveal className="mb-10 max-w-xl sm:mb-14">
          <p className="eyebrow mb-4">Gallery</p>
          <h2 className="text-gradient font-display text-3xl font-bold tracking-tightest sm:text-5xl">
            The difference speaks for itself.
          </h2>
        </Reveal>

        {/* ── A. Comparison ─────────────────────────────────────────────── */}
        <Comparison />

        {/* ── B. Mosaic ─────────────────────────────────────────────────── */}
        <div className="mt-16">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow mb-2">Reference Gallery</p>
              {/* This sentence is a disclosure, not filler. It is what makes the
                  stock photography below honest rather than implied work. */}
              <p className="max-w-md text-[13px] leading-relaxed text-subtle">
                Reference photography showing the surfaces and finishes we work
                on. Our own project photography is being shot now.
              </p>
            </div>

            <div
              role="group"
              aria-label="Filter gallery by category"
              className="flex flex-wrap gap-2"
            >
              <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
                All
              </FilterButton>
              {galleryCategories.map((c) => (
                <FilterButton
                  key={c.id}
                  active={filter === c.id}
                  onClick={() => setFilter(c.id)}
                >
                  {c.label}
                </FilterButton>
              ))}
            </div>
          </div>

          {/* Multi-column masonry. `break-inside-avoid` on each tile is what
              stops a card being split across a column boundary. */}
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
            {items.map((img, i) => (
              <Reveal
                key={img.id}
                direction="scale"
                delay={Math.min(i, 7) * 55}
                className="mb-3 break-inside-avoid"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(i)}
                  className={clsx(
                    'group gradient-border lift sweep-hover relative block w-full overflow-hidden rounded-sm bg-charcoal/60',
                    SHAPE_CLASS[img.shape]
                  )}
                >
                  {/* .img-reveal is clipped until the parent Reveal flips
                      data-revealed, so the wipe plays over an already-decoded
                      image and can never expose an empty box. */}
                  <span className="img-reveal absolute inset-0 block">
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      loading="lazy"
                      quality={70}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover transition-transform duration-700 ease-apex group-hover:scale-[1.06]"
                    />
                  </span>

                  {/* Caption scrim. Always present (not hover-only) so the text
                      never appears over an unmeasured background. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-obsidian via-obsidian/60 to-transparent p-3 pt-10"
                  >
                    <span className="block font-mono text-[10px] uppercase tracking-widest2 text-white/90">
                      {img.caption}
                    </span>
                  </span>

                  <span className="sr-only">View larger</span>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ── C. Lightbox ───────────────────────────────────────────────────── */}
      {active && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/[0.97] p-4 sm:p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="layer tex-noise" aria-hidden="true" />

          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Image ${openIndex! + 1} of ${items.length}: ${active.alt}`}
            className="relative flex h-full w-full max-w-5xl flex-col outline-none"
          >
            <div className="flex shrink-0 items-center justify-between gap-4 pb-3">
              <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                {openIndex! + 1} / {items.length}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Close image viewer"
                className="rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest2 text-muted transition-colors hover:text-white"
              >
                Close ✕
              </button>
            </div>

            <div className="relative min-h-0 flex-1">
              <Image
                key={active.id}
                src={active.src}
                alt={active.alt}
                fill
                quality={82}
                sizes="(max-width: 1024px) 100vw, 1024px"
                className="object-contain"
              />
            </div>

            <div className="mt-3 flex shrink-0 items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous image"
                className="btn-ghost px-5 py-2.5 text-[11px]"
              >
                ← Prev
              </button>

              <p className="min-w-0 flex-1 truncate text-center text-[13px] text-muted">
                {active.alt}
              </p>

              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next image"
                className="btn-ghost px-5 py-2.5 text-[11px]"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Filter button ────────────────────────────────────────────────────────────

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // aria-pressed rather than a tablist: these filter one list in place, they
      // do not swap between separate panels, and announcing them as tabs would
      // promise a relationship that does not exist.
      aria-pressed={active}
      className={clsx(
        'rounded-sm border px-4 py-2 font-mono text-[11px] uppercase tracking-widest2 transition-colors duration-200',
        active
          ? 'border-apex bg-apex/10 text-white'
          : 'border-white/20 text-muted hover:border-white/45 hover:text-white'
      )}
    >
      {children}
    </button>
  );
}

// ── A. Before/after comparison ───────────────────────────────────────────────

/**
 * The slider itself is fully implemented and accessible — it is driven by a
 * real `input[type=range]`, so it works with a keyboard, a screen reader, and a
 * touch drag without any custom pointer code. Firefox thumb styling lives in
 * globals.css alongside the webkit rules.
 *
 * It renders only when `galleryPairs` has genuine entries. See the file header.
 */
function Comparison() {
  const [activePair, setActivePair] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);

  const pair = galleryPairs[activePair];

  if (!pair) return <ComparisonEmptyState />;

  return (
    <Reveal direction="scale">
      <div className="gradient-border relative aspect-[16/9] w-full overflow-hidden rounded-md">
        <Image
          src={pair.after}
          alt={`${pair.label} — after`}
          fill
          loading="lazy"
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 1340px"
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <Image
            src={pair.before}
            alt={`${pair.label} — before`}
            fill
            loading="lazy"
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 1340px"
          />
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={sliderPos}
          onChange={(e) => setSliderPos(Number(e.target.value))}
          aria-label="Drag to compare before and after"
          className="compare-slider absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent [&::-webkit-slider-thumb]:h-full [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-apex"
        />
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-apex"
          style={{ left: `${sliderPos}%` }}
          aria-hidden="true"
        />

        <p className="glass pointer-events-none absolute bottom-5 left-5 rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest2 text-white">
          {pair.label}
        </p>
      </div>

      {galleryPairs.length > 1 && (
        <div className="mt-4 flex gap-2">
          {galleryPairs.map((p, i) => (
            <button
              key={p.id}
              onClick={() => {
                setActivePair(i);
                setSliderPos(50);
              }}
              aria-label={`Show comparison ${i + 1}: ${p.label}`}
              aria-current={i === activePair}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i === activePair ? 'bg-apex' : 'bg-white/25'
              }`}
            />
          ))}
        </div>
      )}
    </Reveal>
  );
}

/**
 * The honest deliverable.
 *
 * A placeholder here is worth designing properly rather than hiding, because
 * the alternative — inventing before/after imagery — is the thing this whole
 * file exists to refuse. It reserves the same 16:9 box the real slider will
 * occupy, so dropping photography in changes nothing about the page geometry.
 */
function ComparisonEmptyState() {
  return (
    <Reveal direction="scale">
      <div className="gradient-border relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-md border border-white/10">
        {/* Decoration only — a schematic split, not a photograph, so nothing
            here can be mistaken for a result. */}
        <div className="layer tex-carbon opacity-60" aria-hidden="true" />
        <div className="layer mesh-gradient opacity-50" aria-hidden="true" />
        <div
          className="layer bg-gradient-to-b from-obsidian/40 via-transparent to-obsidian/80"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-apex/45" aria-hidden="true" />
        <div className="layer tex-noise" aria-hidden="true" />

        <div className="relative max-w-md px-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-sm border border-white/20 text-white/70"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="10.5" r="1.6" />
              <path d="M21 16l-5.5-5.5L7 19" />
            </svg>
          </span>

          <p className="eyebrow mb-3">Before / After</p>
          <h3 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
            Real comparisons, coming soon.
          </h3>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-muted">
            We only publish before-and-after photography from work we have
            actually performed — same vehicle, same light, same angle. Nothing
            staged and no filters standing in for results. Those shots are being
            taken now.
          </p>
          <a href="#services" className="btn-ghost mt-6 text-[11px]">
            See what we do
          </a>
        </div>
      </div>
    </Reveal>
  );
}

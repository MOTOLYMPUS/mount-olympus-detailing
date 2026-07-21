'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { galleryPairs, galleryGrid } from '@/data/gallery';
import { usePrefersReducedMotion } from '@/lib/useDialog';

export default function Gallery() {
  const [activePair, setActivePair] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  const closeLightbox = useCallback(() => setLightbox(null), []);

  // The old lightbox was a bare div with a click handler — no Escape, no focus
  // management. Keyboard users had no way to dismiss it.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    lightboxRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox, closeLightbox]);

  const pair = galleryPairs[activePair];

  return (
    <section id="gallery" className="border-t border-white/10 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-10 max-w-xl sm:mb-14">
          <p className="eyebrow mb-4">Our Work</p>
          <h2 className="font-display text-3xl font-bold tracking-tightest sm:text-5xl">
            The difference speaks for itself.
          </h2>
        </div>

        {/* Comparison slider renders only when real before/after pairs exist.
            See data/gallery.ts for why the faked pairs were removed. */}
        {pair && (
          <>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md">
              <Image src={pair.after} alt={`${pair.label} — after`} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 1340px" />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
              >
                <Image
                  src={pair.before}
                  alt={`${pair.label} — before`}
                  fill
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
              />

              <p className="pointer-events-none absolute bottom-5 left-5 rounded-sm bg-obsidian/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest2 text-white backdrop-blur-sm">
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
          </>
        )}

        <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${pair ? 'mt-16' : ''}`}>
          {galleryGrid.map((img, i) => (
            <motion.button
              key={img.src}
              initial={reduced ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : i * 0.05 }}
              onClick={() => setLightbox(img)}
              className="relative aspect-square overflow-hidden rounded-sm"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                loading="lazy"
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
              <span className="sr-only">View larger</span>
            </motion.button>
          ))}
        </div>
      </div>

      {lightbox && (
        <div
          ref={lightboxRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/96 p-6 outline-none"
          onClick={closeLightbox}
        >
          <div className="relative h-full max-h-[85vh] w-full max-w-4xl">
            <Image src={lightbox.src} alt={lightbox.alt} fill className="object-contain" sizes="100vw" />
          </div>
          <button
            onClick={closeLightbox}
            className="absolute right-6 top-6 rounded-sm px-2 py-1 font-mono text-sm uppercase tracking-widest2 text-white"
            aria-label="Close image viewer"
          >
            Close ✕
          </button>
        </div>
      )}
    </section>
  );
}

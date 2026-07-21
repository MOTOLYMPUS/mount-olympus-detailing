'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { galleryPairs, galleryGrid } from '@/data/gallery';

export default function Gallery() {
  const [activePair, setActivePair] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const pair = galleryPairs[activePair];

  return (
    <section id="gallery" className="border-t border-white/10 py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-14 max-w-xl">
          <p className="eyebrow mb-4">Before &amp; After</p>
          <h2 className="font-display text-4xl font-bold tracking-tightest sm:text-5xl">
            The difference speaks for itself.
          </h2>
        </div>

        {/* Drag comparison slider */}
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md">
          <Image src={pair.after} alt={`${pair.label} — after`} fill className="object-cover" />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <Image src={pair.before} alt={`${pair.label} — before`} fill className="object-cover" />
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={sliderPos}
            onChange={(e) => setSliderPos(Number(e.target.value))}
            aria-label="Drag to compare before and after"
            className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent [&::-webkit-slider-thumb]:h-full [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-apex"
            style={{ WebkitAppearance: 'none' }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-apex"
            style={{ left: `${sliderPos}%` }}
          />

          <div className="pointer-events-none absolute bottom-5 left-5 rounded-sm bg-obsidian/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest2 text-smoke/80 backdrop-blur-sm">
            {pair.label}
          </div>
          <div className="pointer-events-none absolute left-4 top-4 font-mono text-[11px] uppercase tracking-widest2 text-smoke/60">
            Before
          </div>
          <div className="pointer-events-none absolute right-4 top-4 font-mono text-[11px] uppercase tracking-widest2 text-smoke/60">
            After
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {galleryPairs.map((p, i) => (
            <button
              key={p.id}
              onClick={() => {
                setActivePair(i);
                setSliderPos(50);
              }}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i === activePair ? 'bg-apex' : 'bg-white/15'
              }`}
              aria-label={`Show comparison ${i + 1}`}
            />
          ))}
        </div>

        {/* Grid gallery */}
        <div className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {galleryGrid.map((src, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              onClick={() => setLightbox(src)}
              className="relative aspect-square overflow-hidden rounded-sm"
            >
              <Image
                src={src}
                alt="Detailing work sample"
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
            </motion.button>
          ))}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/95 p-6"
          onClick={() => setLightbox(null)}
        >
          <div className="relative h-full max-h-[85vh] w-full max-w-4xl">
            <Image src={lightbox} alt="Detailing work — full view" fill className="object-contain" />
          </div>
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-6 top-6 font-mono text-sm uppercase tracking-widest2 text-white/70 hover:text-white"
            aria-label="Close"
          >
            Close ✕
          </button>
        </div>
      )}
    </section>
  );
}

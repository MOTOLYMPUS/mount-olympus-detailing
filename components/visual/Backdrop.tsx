'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Layered section backdrop.
//
// This is the component the "ghosted background imagery" brief asks for. It
// composes up to four layers, back to front:
//
//   1. A ghosted photograph        — optional, industry-specific, very low alpha
//   2. A procedural texture        — carbon / hex / topo / ripple / marble
//   3. An animated mesh gradient   — colour and movement
//   4. A readability scrim         — ALWAYS on top
//
// LAYER 4 IS NOT OPTIONAL AND IS NOT A DETAIL. Everything above it is
// decoration; the scrim is what guarantees body text still clears WCAG AA over
// whatever ends up behind it. The palette in tailwind.config.ts was measured
// against #050505, so any backdrop that lightens the page invalidates those
// contrast ratios unless the scrim pulls it back down. Raising `intensity`
// raises the decoration AND the scrim together, for exactly that reason.
//
// The photo layer uses next/image with `loading="lazy"` and no `priority`: a
// backdrop is by definition not the LCP element, and marking one `priority`
// would make a decorative image compete with real content for bandwidth.
// ─────────────────────────────────────────────────────────────────────────────

import Image from 'next/image';
import clsx from 'clsx';
import { Industry } from '@/lib/types';
import { backdropImages } from '@/data/media';

export type Texture = 'carbon' | 'hex' | 'topo' | 'ripple' | 'marble' | 'brushed' | 'none';

const TEXTURE_CLASS: Record<Texture, string> = {
  carbon: 'tex-carbon',
  hex: 'tex-hex',
  topo: 'tex-topo',
  ripple: 'ripple-layer',
  marble: 'tex-marble',
  brushed: 'tex-brushed',
  none: '',
};

/**
 * Each industry gets the texture that means something in its trade, rather
 * than a decorative default: carbon fibre for automotive, water ripple for
 * marine, contour lines (altitude) for aviation.
 */
const DEFAULT_TEXTURE: Record<Industry, Texture> = {
  automotive: 'carbon',
  marine: 'ripple',
  aviation: 'topo',
};

export default function Backdrop({
  industry,
  texture,
  photo = true,
  mesh = true,
  grain = true,
  intensity = 'normal',
  className,
}: {
  industry?: Industry;
  /** Overrides the industry default. */
  texture?: Texture;
  /** Ghosted photograph behind the texture. */
  photo?: boolean;
  mesh?: boolean;
  grain?: boolean;
  /** `subtle` for content-dense areas, `strong` for heroes and section breaks. */
  intensity?: 'subtle' | 'normal' | 'strong';
  className?: string;
}) {
  const resolvedTexture = texture ?? (industry ? DEFAULT_TEXTURE[industry] : 'none');
  const image = industry ? backdropImages[industry] : null;

  // Photo alpha stays very low on purpose. Above ~0.14 a photograph starts
  // competing with the text in front of it, which is the failure mode this
  // whole component exists to avoid.
  const photoOpacity = { subtle: 'opacity-[0.05]', normal: 'opacity-[0.09]', strong: 'opacity-[0.14]' }[
    intensity
  ];
  const textureOpacity = { subtle: 'opacity-40', normal: 'opacity-70', strong: 'opacity-100' }[
    intensity
  ];
  const meshOpacity = { subtle: 'opacity-40', normal: 'opacity-70', strong: 'opacity-100' }[intensity];

  return (
    <div className={clsx('layer -z-10', className)} aria-hidden="true">
      {photo && image && (
        <div className={clsx('layer drift-slow', photoOpacity)}>
          <Image
            src={image.src}
            alt=""
            fill
            loading="lazy"
            quality={60}
            // Half-width sources are plenty: the layer is blurred and sits at
            // under 15% opacity, so detail beyond this is bytes nobody sees.
            sizes="(max-width: 768px) 100vw, 60vw"
            className="scale-105 object-cover blur-[2px]"
          />
        </div>
      )}

      {resolvedTexture !== 'none' && (
        <div className={clsx('layer', TEXTURE_CLASS[resolvedTexture], textureOpacity)} />
      )}

      {mesh && <div className={clsx('layer mesh-gradient', meshOpacity)} />}

      {/* Layer 4 — readability. Vertical gradient so section seams disappear
          into the page background at top and bottom. */}
      <div className="layer bg-gradient-to-b from-obsidian via-obsidian/55 to-obsidian" />

      {grain && <div className="layer tex-noise" />}
    </div>
  );
}

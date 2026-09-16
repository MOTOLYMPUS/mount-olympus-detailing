'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Crop a picked photo to the shape of the field it is going into.
//
// The customer sees a viewport with the destination's aspect ratio, drags the
// photo to frame it and zooms with a slider (pinch would be nicer but a
// slider works identically on every phone and desktop). "Use photo" draws
// exactly the framed region onto a canvas and hands back a JPEG.
//
// Re-encoding through a canvas is doing three jobs at once:
//   1. the crop itself;
//   2. size — a 12 MP phone photo becomes a ~1600 px JPEG well under the
//      server's 8 MB cap, so "file too large" cannot happen;
//   3. format — whatever the phone hands us (HEIC on an iPhone that can
//      decode it, PNG, WebP), the server receives a JPEG every browser can
//      show, including the owner's desktop.
//
// Zero dependencies: pointer events for panning, a <canvas> for output.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const OUTPUT_WIDTH = 1600;
const JPEG_QUALITY = 0.88;

export default function PhotoCropper({
  file,
  aspect,
  onCancel,
  onDone,
}: {
  file: File;
  /** width / height of the destination, e.g. 2 for a 2:1 band. */
  aspect: number;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState('');
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1); // multiplier on top of "cover"
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // px, from centred
  const [error, setError] = useState('');
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Object URL for the picked file; revoked when the cropper closes.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Track the viewport's rendered size so the maths below is in real pixels.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientWidth / aspect });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  // Scale that makes the image just cover the viewport, times the zoom.
  const cover = natural ? Math.max(viewport.w / natural.w, viewport.h / natural.h) : 1;
  const scale = cover * zoom;
  const drawnW = natural ? natural.w * scale : 0;
  const drawnH = natural ? natural.h * scale : 0;

  /** Keep the image covering the viewport — no empty edges. */
  function clamp(o: { x: number; y: number }, dw = drawnW, dh = drawnH) {
    const maxX = Math.max(0, (dw - viewport.w) / 2);
    const maxY = Math.max(0, (dh - viewport.h) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, o.x)),
      y: Math.min(maxY, Math.max(-maxY, o.y)),
    };
  }

  function onZoom(next: number) {
    setZoom(next);
    const s = cover * next;
    setOffset((o) => clamp(o, natural ? natural.w * s : 0, natural ? natural.h * s : 0));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const d = drag.current;
    setOffset(clamp({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || !natural) return;

    // The viewport's top-left in image pixels.
    const left = (drawnW - viewport.w) / 2 - offset.x;
    const top = (drawnH - viewport.h) / 2 - offset.y;
    const sx = left / scale;
    const sy = top / scale;
    const sw = viewport.w / scale;
    const sh = viewport.h / scale;

    const outW = Math.min(OUTPUT_WIDTH, Math.round(sw));
    const outH = Math.round(outW / aspect);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Your browser could not process the photo.');
      return;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY));
    if (!blob) {
      setError('Your browser could not process the photo.');
      return;
    }
    onDone(blob);
  }

  // Portalled to <body>: the garage cards carry a hover transform (`.lift`),
  // and a transformed ancestor turns `position: fixed` into "fixed inside the
  // card". Rendering at the body level keeps this a true full-screen sheet.
  // Only ever mounted after a click, so `document` is always available.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
      // z-[100]: above the app header (z-30), its logo mark, and the offline
      // banner (z-[80]) — nothing may sit on top of the crop sheet.
      className="fixed inset-0 z-[100] flex flex-col bg-obsidian/95 backdrop-blur-sm pt-[env(safe-area-inset-top)]"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-white">
          Cancel
        </button>
        <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">Crop to fit</p>
        <button
          type="button"
          onClick={confirm}
          disabled={!natural}
          className="rounded-sm bg-apex px-4 py-1.5 text-sm font-medium text-white hover:bg-apex/90 disabled:opacity-50"
        >
          Use photo
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-[13px] text-muted">Drag to frame your vehicle. This is exactly how it will appear.</p>

        <div
          ref={viewportRef}
          className="relative w-full max-w-xl select-none overflow-hidden rounded-sm border border-white/30 bg-black touch-none"
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* `.photo-fade` on the wrapper: the SAME mask the card applies, so
              the customer frames the photo seeing exactly how its bottom
              third will dissolve into the description. The wrapper carries it
              (not the moving <img>) so the fade stays put while they pan. */}
          <div className="photo-fade absolute inset-0" aria-hidden="true">
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setNatural({ w: el.naturalWidth, h: el.naturalHeight });
                  setOffset({ x: 0, y: 0 });
                  setZoom(1);
                }}
                onError={() => setError('That image could not be opened. Try a JPEG or PNG.')}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: drawnW || undefined,
                  height: drawnH || undefined,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            )}
          </div>
        </div>

        <label className="flex w-full max-w-xl items-center gap-3 text-[11px] font-mono uppercase tracking-widest2 text-subtle">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            className="flex-1 accent-[#D4001A]"
            aria-label="Zoom"
          />
        </label>

        {error && (
          <p className="text-[12px] text-flare" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}

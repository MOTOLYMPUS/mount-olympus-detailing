// ─────────────────────────────────────────────────────────────────────────────
// Generates every PWA icon as a real PNG file, using only node:zlib + node:fs.
//
// WHY hand-rolled: the project takes zero new dependencies (see package.json —
// next/react/react-dom/framer-motion/clsx only), and there is no `canvas`
// native module available. A PNG is just four things — a signature, an IHDR
// chunk describing the bitmap, one or more IDAT chunks holding zlib-compressed
// scanlines, and an IEND chunk — so it is entirely reasonable to emit it by
// hand: compute RGBA pixels in a loop, filter each scanline with type 0
// (None), deflate the result with node:zlib (PNG requires the *zlib* wrapper,
// i.e. RFC 1950, which is exactly what `zlib.deflateSync` produces — not raw
// DEFLATE), and CRC32 each chunk ourselves since node:zlib has no CRC32 helper.
//
// ARTWORK: a single geometric "Mount Olympus" mark — a bold triangular peak,
// white body with a red (#D4001A) cap band near the summit, on the obsidian
// (#050505) brand background. Kept to one shape with no fine detail so it
// still reads as a mountain at a 16×16 favicon. Edges are anti-aliased by
// supersampling 4× and box-downsampling, rather than a scanline AA algorithm —
// simpler to get right by hand and plenty for a flat geometric mark.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

// ── Brand palette (mirrors tailwind.config.ts) ──────────────────────────────
const OBSIDIAN = [5, 5, 5];
const WHITE = [255, 255, 255];
const APEX_RED = [212, 0, 26]; // #D4001A

// ─────────────────────────────────────────────────────────────────────────────
// CRC32 — PNG's chunk checksum. Standard reflected polynomial 0xEDB88320,
// implemented from the algorithm description (not copied from any library —
// there is nothing to copy from; it's ~15 lines).
// ─────────────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG chunk + file assembly ───────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Encodes an RGBA pixel buffer (top-to-bottom, row-major, 4 bytes/pixel) as a
 * PNG file buffer. Always 8-bit depth, color type 6 (truecolor + alpha) —
 * simplest encoder path, and every icon here benefits from an alpha channel
 * even when fully opaque (uniform alpha=255 costs nothing).
 */
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression method (only valid value)
  ihdr[11] = 0; // filter method (only valid value)
  ihdr[12] = 0; // interlace: none

  // Raw scanlines: each row prefixed with a filter-type byte. Filter 0 (None)
  // keeps the encoder trivial; these images are small and simple enough that
  // compression ratio doesn't matter.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Artwork
// ─────────────────────────────────────────────────────────────────────────────

/** Point-in-triangle via sign of cross products (all three same sign ⇒ inside). */
function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

function pointInTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Samples the mark at one point in normalized content-box space (u, v both
 * in [0,1], origin top-left). Returns an [r,g,b] color; everything outside
 * the triangle is background.
 */
function sampleMark(u, v) {
  const apex = [0.5, 0.1];
  const left = [0.09, 0.9];
  const right = [0.91, 0.9];

  if (!pointInTriangle(u, v, apex, left, right)) return OBSIDIAN;

  // Position along the triangle's height, 0 at the apex, 1 at the base.
  const t = (v - apex[1]) / (left[1] - apex[1]);
  // Top ~30% of the peak is the red "summit cap"; the rest is white body.
  return t < 0.3 ? APEX_RED : WHITE;
}

/**
 * Renders one icon as an RGBA buffer of `size × size` pixels.
 *
 * `contentPadding` is the fraction of the canvas reserved as empty margin on
 * every side before the artwork's content box begins — this is what
 * implements the maskable "inner 80% safe zone" (padding = 0.10) vs. the
 * near-full-bleed look used for standard icons (padding = 0.06).
 *
 * Supersampling: each output pixel is the average of an SS×SS grid of samples
 * taken at sub-pixel offsets, which is what gives the diagonal triangle edges
 * smooth anti-aliasing instead of visible stair-stepping — important since
 * these have to still read cleanly all the way down at 16×16.
 */
function renderIcon(size, contentPadding) {
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  const contentSize = size * (1 - 2 * contentPadding);
  const originPx = size * contentPadding;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          // Map canvas pixel -> normalized content-box coordinates.
          const u = (px - originPx) / contentSize;
          const v = (py - originPx) / contentSize;

          const inBox = u >= 0 && u <= 1 && v >= 0 && v <= 1;
          const [cr, cg, cb] = inBox ? sampleMark(u, v) : OBSIDIAN;
          r += cr;
          g += cg;
          b += cb;
        }
      }

      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255; // every icon here is fully opaque — solid brand background, no transparency
    }
  }

  return rgba;
}

function writeIcon(filename, size, contentPadding) {
  const rgba = renderIcon(size, contentPadding);
  const png = encodePNG(size, size, rgba);
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, png);
  const { size: bytes } = fs.statSync(outPath);
  console.log(`  wrote ${filename}  (${size}x${size}, ${bytes} bytes)`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Generating icons into ${OUT_DIR}`);

  // Standard + maskable app icons (manifest.webmanifest).
  writeIcon('icon-192.png', 192, 0.06);
  writeIcon('icon-512.png', 512, 0.06);
  // Maskable variants: OS may crop to a circle/squircle, so the artwork must
  // stay inside the inner 80% "safe zone" (10% padding on every side).
  writeIcon('icon-maskable-192.png', 192, 0.1);
  writeIcon('icon-maskable-512.png', 512, 0.1);

  // iOS home-screen icon. iOS composites its own rounded-square mask and
  // ignores alpha (a transparent pixel renders as opaque black), so this must
  // be a fully opaque square — which every icon here already is.
  writeIcon('apple-touch-icon.png', 180, 0.08);

  // Browser tab favicons.
  writeIcon('favicon-32.png', 32, 0.06);
  writeIcon('favicon-16.png', 16, 0.04); // extra-thin margin — every pixel counts at 16px

  const readme = `# public/icons

These PNGs are **generated placeholders**, produced by \`scripts/generate-icons.mjs\`
(a zero-dependency PNG encoder using only \`node:zlib\`/\`node:fs\` — no canvas,
no image library). The artwork is a simple geometric "Mount Olympus" triangular
peak mark in the brand colors (obsidian #050505 background, white body, #D4001A
summit cap).

## Replacing with real artwork

1. Design the real icon at 512×512 (and a maskable variant with the logo kept
   inside the inner 80% "safe zone" — many OSes crop maskable icons to a
   circle/squircle).
2. Export PNGs at the same filenames/sizes listed below and drop them in here,
   or point \`app/layout.tsx\` / \`public/manifest.webmanifest\` at new files.
3. Re-run \`node scripts/generate-icons.mjs\` only if you want to regenerate the
   placeholders — it will overwrite everything in this directory.

## Files

| File                        | Size    | Purpose                              |
|-----------------------------|---------|---------------------------------------|
| icon-192.png                | 192×192 | manifest icon, purpose "any"          |
| icon-512.png                | 512×512 | manifest icon, purpose "any"          |
| icon-maskable-192.png       | 192×192 | manifest icon, purpose "maskable"     |
| icon-maskable-512.png       | 512×512 | manifest icon, purpose "maskable"     |
| apple-touch-icon.png        | 180×180 | iOS home-screen icon (opaque)         |
| favicon-32.png              | 32×32   | browser tab                            |
| favicon-16.png              | 16×16   | browser tab                            |
`;
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme);
  console.log('  wrote README.md');

  console.log('Done.');
}

main();

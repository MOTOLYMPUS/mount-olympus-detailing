#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Renders the app icons as the stacked wordmark
//
//     MOUNT
//     OLYMPUS
//     DETAILING   ← apex red
//
// in the brand display face (Archivo 800) and writes them to public/icons/.
//
// WHY A BROWSER IS INVOLVED: the project takes no image or font dependencies,
// and Node has no text rasteriser of its own. A browser <canvas> is the one
// zero-dependency place that can shape and anti-alias real type. So this
// script is a tiny local web server: it serves a page that draws every icon
// size on a canvas, and the page POSTs each PNG straight back to this server,
// which writes it into public/icons/. Nothing leaves the machine.
//
// USAGE
//   node scripts/icon-wordmark.mjs          # starts on http://localhost:3999
//   open that URL in any browser            # icons render + save automatically
//   Ctrl+C when the page says "Done"
//
// scripts/generate-icons.mjs is the OLD geometric placeholder mark. Running it
// would overwrite these. It is kept only as the zero-dependency fallback.
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const PORT = Number(process.env.ICON_PORT ?? 3999);

// Only these filenames may be written — the request's `name` is matched
// against this list, never used as a path.
const FILES = [
  'icon-512.png',
  'icon-192.png',
  'icon-maskable-512.png',
  'icon-maskable-192.png',
  'apple-touch-icon.png',
  'favicon-32.png',
  'favicon-16.png',
];

const PAGE = /* html */ `<!doctype html>
<meta charset="utf-8">
<title>Icon wordmark renderer</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@800&display=swap" rel="stylesheet">
<style>
  body { background:#111; color:#eee; font:14px system-ui; padding:24px }
  canvas { background:#050505; margin:8px; border:1px solid #333 }
  #log { white-space:pre; margin-top:16px }
</style>
<h1>Rendering icons…</h1>
<div id="previews"></div>
<div id="log"></div>
<script>
const OBSIDIAN = '#050505', WHITE = '#ffffff', RED = '#D4001A';
const log = (m) => { document.getElementById('log').textContent += m + '\\n'; };

// Archivo's cap height is ~0.71 em; used to centre the block optically on the
// letters themselves rather than on the font's line box.
const CAP = 0.71;

function drawWordmark(size, pad) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = OBSIDIAN;
  ctx.fillRect(0, 0, size, size);

  const box = size * (1 - 2 * pad);
  const lines = [['MOUNT', WHITE], ['OLYMPUS', WHITE], ['DETAILING', RED]];
  const tracking = -0.035; // em, matches the tight display lockup in the navbar

  // One font size for all three lines, chosen so the longest word spans the
  // content box; then shrink if the three-line block would overflow it.
  let fs = 100;
  const widthAt = (text, f) => {
    ctx.font = '800 ' + f + 'px Archivo';
    return ctx.measureText(text).width + tracking * f * (text.length - 1);
  };
  fs = fs * (box * 0.96) / widthAt('DETAILING', fs);
  const gap = 0.20;                      // em between lines
  const blockEm = 3 * CAP + 2 * gap;
  if (fs * blockEm > box) fs = box / blockEm;

  const blockH = fs * blockEm;
  let y = (size - blockH) / 2 + fs * CAP; // baseline of the first line
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 ' + fs + 'px Archivo';
  ctx.letterSpacing = (tracking * fs) + 'px';
  for (const [text, color] of lines) {
    ctx.fillStyle = color;
    // letterSpacing adds a trailing space after the last glyph; nudge right
    // by half of it so the visible letters sit dead centre.
    ctx.fillText(text, size / 2 - (tracking * fs) / 2, y);
    y += fs * (CAP + gap);
  }
  return c;
}

// At 16 and 32 px three words are an unreadable smudge, so the favicons carry
// a single bold "M" with a red base bar — same palette, same face.
function drawFavicon(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = OBSIDIAN;
  ctx.fillRect(0, 0, size, size);
  const fs = size * 0.92;
  ctx.font = '800 ' + fs + 'px Archivo';
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('M', size / 2, size * 0.78);
  ctx.fillStyle = RED;
  ctx.fillRect(size * 0.12, size * 0.86, size * 0.76, Math.max(1, size * 0.09));
  return c;
}

async function save(name, canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const res = await fetch('/icon?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  log((res.ok ? 'saved ' : 'FAILED ') + name + ' (' + canvas.width + 'px, ' + blob.size + ' bytes)');
  document.getElementById('previews').appendChild(canvas);
}

(async () => {
  await document.fonts.load('800 100px Archivo');
  if (!document.fonts.check('800 100px Archivo')) log('WARNING: Archivo did not load; falling back to system font');
  await save('icon-512.png', drawWordmark(512, 0.08));
  await save('icon-192.png', drawWordmark(192, 0.08));
  // Maskable: OS may crop to a circle, so keep the words inside the inner 80%.
  await save('icon-maskable-512.png', drawWordmark(512, 0.14));
  await save('icon-maskable-192.png', drawWordmark(192, 0.14));
  // iOS applies its own rounded mask and ignores alpha — fully opaque square.
  await save('apple-touch-icon.png', drawWordmark(180, 0.09));
  await save('favicon-32.png', drawFavicon(32));
  await save('favicon-16.png', drawFavicon(16));
  document.querySelector('h1').textContent = 'Done — icons written to public/icons/';
  await fetch('/done', { method: 'POST' });
})();
</script>`;

fs.mkdirSync(OUT_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/icon') {
    const name = url.searchParams.get('name') ?? '';
    if (!FILES.includes(name)) {
      res.writeHead(400);
      res.end('unknown icon name');
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(path.join(OUT_DIR, name), buf);
      console.log(`  wrote ${name} (${buf.length} bytes)`);
      res.writeHead(204);
      res.end();
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/done') {
    console.log('All icons written. Stopping.');
    res.writeHead(204);
    res.end();
    setTimeout(() => process.exit(0), 200);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Icon renderer: open http://localhost:${PORT}/ in a browser`);
  console.log(`Writing into ${OUT_DIR}`);
});

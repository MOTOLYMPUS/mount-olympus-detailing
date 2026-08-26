# public/icons

These PNGs are **generated placeholders**, produced by `scripts/generate-icons.mjs`
(a zero-dependency PNG encoder using only `node:zlib`/`node:fs` — no canvas,
no image library). The artwork is a simple geometric "Mount Olympus" triangular
peak mark in the brand colors (obsidian #050505 background, white body, #D4001A
summit cap).

## Replacing with real artwork

1. Design the real icon at 512×512 (and a maskable variant with the logo kept
   inside the inner 80% "safe zone" — many OSes crop maskable icons to a
   circle/squircle).
2. Export PNGs at the same filenames/sizes listed below and drop them in here,
   or point `app/layout.tsx` / `public/manifest.webmanifest` at new files.
3. Re-run `node scripts/generate-icons.mjs` only if you want to regenerate the
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

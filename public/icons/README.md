# public/icons

The app icons are the stacked **MOUNT / OLYMPUS / DETAILING** wordmark
(white, white, apex red #D4001A on obsidian #050505) set in Archivo 800, the
same display face the site uses. The 16 and 32 px favicons carry a single
bold "M" with a red base bar instead, because three words are unreadable at
that size.

## Regenerating

```
node scripts/icon-wordmark.mjs
```

then open http://localhost:3999/ in a browser. The page renders every size on
a canvas and writes the PNGs back into this folder; it exits when done.

`scripts/generate-icons.mjs` is the OLD zero-dependency triangular placeholder
mark. Do not run it unless you mean to replace the wordmark.

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

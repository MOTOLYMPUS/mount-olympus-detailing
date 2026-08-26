# Visual System

How the immersive layer works, what it costs, and the rules for extending it.

---

## The central decision: procedural, not photographic

Every texture, pattern, particle and gradient in this system is drawn with CSS
gradients or inline SVG. There is **not one photograph** in the decorative layer.

That is not a compromise — it is the only way to satisfy both halves of the
brief ("rich visual depth" and "fast page load times") at once.

| | Cost |
|---|---|
| Entire decorative CSS system, gzipped | **3.2 KB** |
| One 1600px texture JPEG | 180–400 KB |
| Extra network requests added to the hero | **1** (lazy ghost layer) |
| Frame rate with every layer running | **60 FPS** |

Three further consequences worth stating:

- **Resolution-independent.** Sharp on a 5K display and on a phone. No `srcset`,
  no art direction, nothing to lazy-load, no layout shift.
- **No licensing or provenance risk.** A generated hexagon mesh cannot be
  mistaken for a photograph of work this business performed. See the honesty
  rules below.
- **Themeable.** Every texture inherits the apex red and obsidian from one place.

Photography is used for exactly two things: the hero (the LCP element, which
should be a photograph) and ghosted backdrops at 5–14% opacity behind a blur.

---

## Files

```
app/globals.css                 The "DECORATIVE LAYER SYSTEM" block — all textures,
                                animations, and the reveal/reduced-motion rules
components/visual/
  Backdrop.tsx                  Composed section background (photo + texture + mesh + scrim)
  Reveal.tsx                    Scroll-triggered reveal, one shared IntersectionObserver
  Effects.tsx                   Parallax, Spotlight, Motes, Counter, Tilt, Mountains
  Skeleton.tsx                  Loading skeletons matched to real component geometry
```

### Texture classes

| Class | Reads as | Used for |
|---|---|---|
| `.tex-carbon` | 2×2 twill carbon weave | Automotive |
| `.tex-hex` | SiO₂ lattice | Ceramic coating sections |
| `.tex-topo` | Contour lines / altitude | Aviation, and the Mount Olympus brand |
| `.ripple-layer` | Water surface | Marine |
| `.tex-marble` / `.tex-brushed` | Stone, brushed metal | Premium surfaces |
| `.tex-noise` | Film grain | **Kills gradient banding** on 8-bit panels |

`.tex-noise` is the one that is easy to dismiss as decoration and is not: large
flat dark areas visibly step on 8-bit displays, and a grain overlay is the
cheapest fix there is.

### Effect classes

`.mesh-gradient` (animated aurora) · `.light-sweep` (specular gloss pass) ·
`.sweep-hover` (gloss on hover only) · `.gradient-border` (masked 1px ring) ·
`.glass` (backdrop-filter surface) · `.lift` (card elevation) · `.mote`
(particles) · `.drift-slow` · `.skeleton` · `.spotlight` · `.hairline-glow` ·
`.text-gradient` · `.img-reveal`

---

## The four rules

Every decorative element in this codebase obeys these. Breaking any one of them
is how a "premium" site becomes a slow, inaccessible one.

**1. `pointer-events: none` and `aria-hidden="true"`.**
Decoration is not content and must never eat a click or reach a screen reader.

**2. Animate `transform` and `opacity` only.**
Animating `background-position`, `filter`, `box-shadow`, `width` or `top` forces
layout or paint on every frame. That is what makes effects stutter on a
mid-range phone. Everything here is compositor-only, which is why the measured
frame rate is 60 FPS even under heavy load.

**3. Throttle every scroll and pointer handler with `requestAnimationFrame`,
and mark it `passive`.**
An unthrottled scroll listener fires far more often than the screen refreshes.
`Parallax` in `Effects.tsx` is the reference implementation — it also stops
computing entirely while off-screen.

**4. Content must survive without JavaScript.**
`[data-reveal]` starts at `opacity: 0`. If the reveal script never runs, the
whole page would be blank — so `globals.css` carries a `@media (scripting: none)`
fallback, `Reveal.tsx` reveals immediately when `IntersectionObserver` is
missing, and elements already on screen at mount reveal without waiting for a
scroll that may never come.

---

## Readability is enforced, not hoped for

The greys in `tailwind.config.ts` (`muted` #B4B4B4 ≈ 9.4:1, `subtle` #8E8E8E ≈
5.5:1) were **measured against `#050505`**. Any backdrop that lightens the page
invalidates those ratios.

### `bg-apex` for surfaces, `text-flare` for type

The brand red `#D4001A` is a **surface** colour. White on an apex button is
5.5:1 and fine. But apex as a **text** colour on `#050505` is only **3.7:1** —
under the 4.5:1 AA floor.

An automated contrast audit during this work found it was the colour of every
form **error message**, the required-field asterisk, and half the logo lockup.
Error text is the worst possible place for a sub-threshold colour: it is read
under pressure, often by exactly the people who need the contrast most.

`flare` (`#FF3B4A`, **5.7:1**) is the same hue made legible as type. Swapped in
across 56 occurrences in 35 files. If you reach for `text-apex`, you want
`text-flare`.

### Verified, not assumed

Contrast was measured in the browser from what was actually painted — walking up
the DOM for the first opaque background, applying the WCAG large-text exemption,
and skipping gradient-filled text. Current state:

| Route | Elements checked | Failures |
|---|---|---|
| `/` | 211 | **0** |
| `/app` | 51 | **0** |
| `/login` | 12 | **0** |

Plus: CLS **0** over a full scroll of the 13,500px home page at 375px, **60–61
FPS** with every layer running, and no horizontal overflow at mobile width.

Re-run that audit after any visual change. Screenshots do not catch this class
of bug — that is how a 3.7:1 error message survived until now.

So `Backdrop.tsx` always composites a scrim as its topmost layer, and raising
`intensity` raises the decoration *and* the scrim together. There is no way to
turn the decoration up without turning the protection up with it.

Where photography and body copy would have collided, legibility won:

- Service cards: the copy panel sits on a 95%-opaque base. The photograph reads
  in the top plate and is atmosphere below it.
- `WhyChooseUs` and `Reviews` use `photo={false}` backdrops. Several paragraphs
  of `text-muted` over a ghosted photograph is where contrast dies.
- `.glass` is **not** on the service cards. `backdrop-filter` makes the
  compositor re-sample everything behind an element; on a nine-card scrolling
  grid that is a real cost. Glass is reserved for small, non-scrolling surfaces:
  the navbar, the three industry cards, the icon chips, the sticky estimate
  readout, and the auth card.

---

## Motion, and the users who don't want it

`prefers-reduced-motion` is handled **centrally** in `globals.css`, not
per-component. Under reduced motion:

- every keyframe animation collapses to 0.01ms,
- `.light-sweep` and `.mote` are `display: none` (removed, not merely stilled),
- `[data-reveal]` elements are shown instantly and are **never hidden**,
- `Motes`, `Parallax`, `Spotlight`, `Tilt` and `Counter` return early in JS,
  so their listeners are never even attached.

The last point matters: honouring the preference in CSS alone would still leave
the pointer and scroll handlers running.

`Counter` deserves its own note. It renders the **final** value in the server
HTML and only animates after mount. An implementation that starts at `0` in the
markup ships a page that lies about its own content to search engines, screen
readers on first paint, and anyone whose JS fails.

---

## Restraint in the app

The marketing site and the PWA get deliberately different treatments.

`/app`, `/staff` and `/admin` are **working tools**. A technician opens a job
with wet hands in a driveway; an owner checks revenue between jobs. Drifting
particles behind a data table are hostile there.

So the app shell uses `intensity="subtle"`, the photo layer off, and a `fixed`
(non-scrolling) backdrop — a texture that slides under a long list is motion in
the reader's peripheral vision on every scroll event. No motes, no parallax, no
light sweep on any list, form, or the job runner.

Spectacle is reserved for the two moments that earn it: the **auth screens**
(seen once, briefly, and the app's first impression) and the **booking
confirmation**.

UI feedback animations are capped at ~200–300ms. A 700ms reveal on a dashboard
someone checks ten times a day stops being delightful and becomes an obstacle.

---

## Honesty rules — do not relax these

`data/gallery.ts` and `data/reviews.ts` were emptied in an earlier audit for a
specific reason: the previous gallery faked its before/after pairs by pointing
at the **same** Unsplash photo twice with a desaturation filter on the "before".
That presents a colour filter as a record of work performed — a false claim
about results, and specifically risky under the FTC rule on consumer reviews and
endorsements (16 CFR Part 465) for a business that sells paint correction on
visible outcomes.

Accordingly, this work:

- leaves `galleryPairs` as `[]` and ships a **designed empty state** that names
  the standard for real pairs (same vehicle, comparable light and angle, no
  filters). The slider is fully built; drop real pairs in and it lights up with
  no other code change;
- captions the mosaic **"Reference Gallery"** with a visible disclosure —
  *"Reference photography showing the surfaces and finishes we work on. Our own
  project photography is being shot now."* That wording is load-bearing;
- writes every `alt` string to describe **only what the photograph shows**.
  None says "our", "we", or "this customer";
- creates **no** "our work", "customer vehicles", or "team at work" section;
- adds **no animated statistics.** `<Counter>` was available and would have been
  the obvious flourish, but no years-in-business, jobs-completed, or
  satisfaction figure exists anywhere in this repo. Inventing one would be the
  same problem `data/reviews.ts` was emptied for, made worse by animation
  lending it credence.

**If you add real photography, you may remove the disclosure — not before.**

---

## Extending it

- New texture → add a class in the `globals.css` block. Keep alpha under ~0.06;
  above that a tile reads as moiré rather than material.
- New industry → add an entry to `DEFAULT_TEXTURE` in `Backdrop.tsx` and to
  `AMBIENCE` in `Hero.tsx`. Nothing else needs to change.
- New image → **reuse an id already in `data/media.ts`.** Guessed Unsplash ids
  404'd during the first pass. Run `node scripts/check-images.mjs` after any
  change; it must report 0 dead.
- New animation → transform/opacity only, and check it against reduced motion
  before committing.

## Running two Next instances

`next.config.js` honours `NEXT_DIST_DIR`. Two Next processes sharing `.next`
overwrite each other's chunk manifests; the symptom is a flood of 404s on
`/_next/static/chunks/*.js` and a page that renders completely unstyled.

```bash
NEXT_DIST_DIR=.next-preview npx next dev -p 3212
```

`next dev` and `next build` need **separate** dist dirs — dev cannot reuse a
production build directory. `.next-*` is gitignored.

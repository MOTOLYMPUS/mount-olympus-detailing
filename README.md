# Mount Olympus Detailing

Multi-industry detailing site — **Automotive, Marine, and Aviation** from one codebase.
Next.js 14 (App Router), TypeScript, Tailwind, Framer Motion, SQLite.

## Requirements

**Node >= 22.5** — the database uses Node's built-in `node:sqlite` module. Check with
`node --version`.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables are needed to run. Estimate requests save to `./data.sqlite`
immediately; email and SMS stay switched off until you configure them (see `.env.example`).

```bash
npm run build      # production build
npm start          # serve the build
npm run typecheck  # tsc --noEmit
npm test           # end-to-end API smoke tests (needs a running server)
node scripts/check-images.mjs   # verify every stock image URL still resolves
```

## How the three industries work

`lib/industries.ts` is the single source of truth. Switching industry changes the hero image,
headline, subheadline, eyebrow, CTA copy, terminology (`vehicle` / `vessel` / `aircraft`),
field labels (`Make` / `Builder` / `Manufacturer`), categories, size classes, services,
pricing, and the "why choose us" points.

No component contains an industry conditional. Adding a fourth industry means adding an entry
to `lib/industries.ts`, a price table in `data/pricing/`, and a make/model catalog in
`data/vehicles/` — nothing else.

## Project structure

```
app/
  api/estimates/route.ts   The one write path: validate → reprice → persist → notify
  layout.tsx page.tsx      Shell and composition
  error.tsx not-found.tsx
components/
  IndustryProvider.tsx     Industry context
  IndustrySelector.tsx     The three hero cards (radiogroup)
  EstimateFlow/            5-step wizard: Vehicle → Services → Estimate → Details → Sent
  Field.tsx                Shared, labelled, accessible form controls
lib/
  industries.ts            Per-industry config — start here
  pricing.ts               Pricing engine (client + server share it)
  types.ts db.ts           Domain model, SQLite access
  validation.ts security.ts notify.ts
data/
  pricing/                 Price tables per industry
  vehicles/                Make/model catalogs (automotive, motorcycle, marine, aviation)
  media.ts                 Every image URL in the app
scripts/                   smoke.mjs, check-images.mjs
```

## Pricing

`data/pricing/automotive.ts` holds the owner's **real** price list, keyed on
(service × size class) — no multipliers, no derived numbers except two clearly marked
`DERIVED` cells.

`marine.ts` and `aviation.ts` are **placeholders** — no price list was supplied for those
industries. Each exports an `*_IS_PLACEHOLDER` flag that is `true`; while it is, the UI shows
an "indicative pricing" disclosure on every quote and the notification email flags it. Replace
the numbers and set the flag to `false`.

## Contact & notifications

Set in `lib/business.ts` — one file, no other hardcoding:

| | Shown on site? | |
|---|---|---|
| Contact email | ✅ public | `Luis.rodriguez621@outlook.com` |
| Contact phone | ✅ public | `(469) 390-1255` |
| Backup phone | ❌ **never rendered** | notification failover only |
| Hours | ✅ public | 12-hour clock (`8:00 AM – 7:00 PM`) |

On every estimate submission the owner gets an email to the contact address and an SMS to the
primary number. **The backup number is a failover, not a duplicate** — it only fires if the
primary send fails, so a normal lead is one text.

The backup number is deliberately **not** part of the `business` object. It lives in a separate
`internalNotificationTargets` export in `lib/business.ts`, referenced only by the server-side
failover in `lib/notify.ts`, so it cannot be reached by anything rendering `business.*` and
never reaches the client bundle. Verified against the build output and the served HTML.

Recipients default to the values above with no environment configuration; `BUSINESS_EMAIL`,
`BUSINESS_PHONE`, and `BUSINESS_PHONE_BACKUP` exist only to redirect them.

## Domain, booking link, payments

| Item | Status | To change |
|---|---|---|
| **Domain** | Not registered. Falls back to `localhost:3000`. | Set `NEXT_PUBLIC_SITE_URL` |
| **Booking calendar** | Not configured. Provider-agnostic — Calendly, Google, Square, Acuity all work. | Set `NEXT_PUBLIC_BOOKING_URL`; a "Book Your Slot" button then appears on the confirmation screen and in the customer email |
| **Payments** | None. Quote-only by design: you confirm the price, then take payment in person or by invoice. No PCI scope, no processor fees. | See `.env.example` |

Nothing renders a dead link when these are unset — the booking button simply isn't drawn.

## Before you launch

These are deliberate, visible blockers — none of them fail silently:

1. **`data/media.ts`** — all imagery is Unsplash stock, not your work.
2. **`data/reviews.ts`** — emptied. The previous version shipped four invented testimonials and
   a fake "5.0 · 214 Google Reviews" badge; publishing those violates the FTC rule on consumer
   reviews (16 CFR Part 465). Repopulate only with real, permitted reviews.
3. **`data/gallery.ts`** — before/after pairs emptied. The old ones were the same photo twice
   with a desaturation filter on the "before".
4. **Marine + aviation pricing** — placeholder figures, flagged in the UI. Replace them and
   clear the two `*_IS_PLACEHOLDER` flags.
5. **`app/layout.tsx`** — `robots` is set to `noindex` so the site can't be indexed while the
   above are outstanding. Flip it when they're resolved.
6. **Privacy policy + terms** — not written. Required before SMS (A2P 10DLC registration) and
   for GDPR/CCPA once you're storing names, emails, and phone numbers.

See `COMPLETION.md` for the full status report and `AUDIT.md` for the original audit.

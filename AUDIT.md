# Apex Detailing — Application Audit Report

**Audit date:** 2026-07-21
**Scope:** Complete inspection of every file in `detailing-site/` (27 source files, ~1,900 LOC).
**Method:** Full read of all source, config, and data files. Static analysis only — the app was
never executed because `node_modules` is not installed and no build artifact (`.next`) exists.

---

## 0. Executive summary

This is a **frontend-only marketing site**. There is no backend of any kind:

- **0 API routes** (`app/api/` does not exist)
- **0 database** (no ORM, no schema, no client, no connection string)
- **0 server actions**
- **0 email or SMS integration**
- **0 tests, 0 CI**
- **No customer contact information is collected anywhere in the app** — you can complete the
  entire 6-step "booking" and the business never learns the customer's name, phone, or email.

Everything that looks transactional (booking, payment, calendar availability, confirmation
email) is a **client-side simulation**. When a user finishes the flow and sees "You're booked in
— a confirmation has been sent", **nothing was saved and nothing was sent**. The data is
discarded from React state 300 ms after the modal closes.

Against the requested three-industry (Automotive / Marine / Aviation) specification, the app
currently supports **one industry (automotive only)**, with no industry concept in the data
model at all.

**Overall completion against the stated requirements: roughly 15%.** The visual/UI layer is
genuinely well built; the entire product layer beneath it is absent.

---

## 1. Fully completed features

These work as intended today, with no missing code.

| Feature | Files | Notes |
|---|---|---|
| Page shell / layout / font loading | `app/layout.tsx` | Archivo/Inter/JetBrains Mono via `next/font`, `display: swap`. Clean. |
| Design token system | `tailwind.config.ts`, `app/globals.css` | Coherent palette, type scale, easing curve, reusable `.btn-apex` / `.btn-ghost` / `.glass-panel` / `.input-field` classes. |
| Sticky navbar with scroll state | `components/Navbar.tsx` | Passive scroll listener, correct cleanup, transitions to solid on scroll. |
| Mobile hamburger menu | `components/Navbar.tsx` | Opens/closes, `aria-expanded` set, closes on link tap. |
| Anchor navigation | `Navbar.tsx` + section `id`s | All 5 nav links (`#services`, `#gallery`, `#pricing`, `#about`, `#reviews`) resolve to real sections. Verified. |
| Services grid rendering | `components/ServicesGrid.tsx`, `data/services.ts` | 8 services render with image, description, hours, starting price. |
| Reviews section | `components/Reviews.tsx`, `data/reviews.ts` | Renders correctly (content is fabricated — see §11). |
| "Why choose us" section | `components/WhyChooseUs.tsx` | Static content, renders correctly. |
| Footer | `components/Footer.tsx` | Static; contact details are placeholders. |
| Scroll-reveal animations | Framer Motion `whileInView` throughout | Work correctly, `once: true` prevents re-trigger thrash. |
| Mobile sticky "Book Now" bar | `app/page.tsx` | Correct `lg:hidden`, body has matching `pb-20` so it never covers content. |
| Estimate math (as written) | `lib/pricing.ts` | The formula is internally consistent and correct. The **prices themselves are placeholder values that do not match your real price list** — see §4. |

---

## 2. Partially completed features

### 2.1 Estimate calculator
- **Status:** Calculates and displays correctly, but is a dead end.
- **Why not functional:** `app/page.tsx:33-35` — the `onBook` callback receives
  `(services, size)` and **throws both away except `services[0]`**:
  ```tsx
  onBook={(services, size) => openBooking({ serviceId: services[0] })}
  ```
  Select "Paint Correction + Ceramic + Interior" on an SUV, click **Book Appointment**, and the
  modal opens with **one** service selected and vehicle size silently reset to `coupe`. The
  price the customer just agreed to is not the price they are shown next.
- **Files:** `app/page.tsx`, `components/EstimateCalculator.tsx`, `components/BookingFlow/BookingModal.tsx`
- **Missing code:** `BookingPrefill` needs `serviceIds: ServiceId[]` and `size: VehicleSize`;
  `BookingModal`'s prefill effect must consume both.
- **Complexity:** Trivial (≈15 lines).
- **Production ready after fix:** Yes.

### 2.2 Booking wizard (6 steps)
- **Status:** All 6 steps render, navigate forward/back, and validate. State is held correctly.
- **Why not functional:** It terminates in a fake success. No persistence, no payment, no
  notification, no customer identity. See §3.1, §3.2, §5.1.
- **Files:** `components/BookingFlow/*` (7 files), `app/page.tsx`
- **Complexity:** Large — this is the core of the remaining work.

### 2.3 Calendar / availability
- **Status:** Calendar UI is well built — month grid, past-date disabling, Sunday closure,
  morning/afternoon/evening slot grouping, timezone label.
- **Why not functional:** `lib/availability.ts:33-39` — availability is a **`Math.sin()` hash of
  the date**. It is not connected to any calendar. Two customers can book the identical slot;
  slots a customer sees as "open" may be fully booked in reality.
- **Files:** `lib/availability.ts`, `components/Calendar.tsx`, `components/BookingFlow/StepCalendar.tsx`
- **Missing:** A real availability source (DB table of bookings, or Google Calendar / Calendly /
  Square API), plus a server-side double-booking guard at write time.
- **Complexity:** Medium.

### 2.4 Vehicle make/model selection
- **Status:** Hero booking card has a `<select>` with **9 hardcoded makes** (`components/BookingCard.tsx:8-18`).
  Model is a **free-text input** — no model list exists anywhere in the codebase.
- **Gap vs. requirement:** You asked for ~43 automotive manufacturers with full model lists, plus
  16 motorcycle, 27 marine, and 20 aviation manufacturers. **~0% of this data exists.**
- **Files:** `components/BookingCard.tsx`, `components/BookingFlow/StepVehicle.tsx`
- **Complexity:** Large (data volume), low (logic).

### 2.5 Gallery before/after slider
- **Status:** Slider drags and swaps between 3 comparisons; lightbox opens on grid images.
- **Why not fully functional:**
  - "Before" and "after" are **the same Unsplash photo**, with `&sat=-100&con=-10` appended to
    fake the "before" (`data/gallery.ts:10-14`). This is not real work product.
  - Firefox: only `::-webkit-slider-thumb` is styled, so Firefox renders a default grey thumb
    over the image.
  - Lightbox has no Escape-key close and no focus trap (see §9).

---

## 3. Placeholder features (look finished, do nothing)

These are the most serious category — a customer cannot tell them apart from working features.

### 3.1 Payment — **FULLY FAKE**
- **Status:** Placeholder.
- **Why not functional:** `components/BookingFlow/BookingModal.tsx:84-91`:
  ```tsx
  const handlePay = () => {
    setProcessing(true);
    setTimeout(() => { setProcessing(false); setStep(5); }, 1100);
  };
  ```
  A `setTimeout` is the entire payment system. The card number, expiry, and CVC inputs in
  `StepPayment.tsx:104-108` are **unbound `<input>` elements with no `value`, no `onChange`, and
  no state** — the typed digits are never read by any code. The "🔒 Stripe Secured / PCI-DSS
  Compliant" badges on line 118 are decorative text over a system that processes nothing.
- **Files:** `components/BookingFlow/StepPayment.tsx`, `components/BookingFlow/BookingModal.tsx`
- **Backend required:** `/api/payments/create-intent` route, Stripe SDK, webhook handler at
  `/api/webhooks/stripe` for `payment_intent.succeeded` (never trust the client's success claim).
- **Frontend required:** Replace raw card inputs with Stripe Elements / `PaymentElement`.
  **Raw PAN fields must be deleted** — see §11.1.
- **Database required:** `payments` table (intent id, amount, status, booking fk).
- **Third-party:** Stripe account, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`.
- **Complexity:** Medium-high.
- **Production ready after implementation:** Yes, if Elements + webhook verification are used.

### 3.2 Confirmation email / SMS — **CLAIMED BUT NEVER SENT**
- **Status:** Placeholder. Actively misleading.
- **Why not functional:** `StepConfirmation.tsx:26` states *"A confirmation has been sent"*.
  There is no email code, no SMS code, no API route, and — critically — **no email address or
  phone number was ever collected**. Nothing can be sent because nothing is known.
- **Files:** `components/BookingFlow/StepConfirmation.tsx`
- **Complexity:** Medium (blocked on §5.1 collecting contact info first).

### 3.3 Availability
See §2.3 — deterministic pseudo-random, not real.

### 3.4 Business contact details
`components/Footer.tsx:26-28` — `hello@apexatelier.com` and `(555) 019-2244`. `555-01xx` is the
reserved fictional-number range. A customer who calls reaches nothing.

### 3.5 All imagery
Every image in the app is a remote Unsplash stock URL (`data/services.ts`, `data/gallery.ts`,
`components/Hero.tsx:22`). None of it is this business's work.

---

## 4. Broken features / defects

| # | Severity | Defect | Location |
|---|---|---|---|
| B1 | **High** | Estimate → booking loses services and vehicle size (see §2.1). | `app/page.tsx:33` |
| B2 | **High** | Calendar date off-by-one east of UTC. `toKey()` calls `toISOString()` on a **local-midnight** `Date`. At UTC+2, local midnight 21 Jul = 20 Jul 22:00 UTC → key becomes `2026-07-20`. Customer books a different day than they clicked. | `components/Calendar.tsx:15-17` |
| B3 | **High** | The inverse round-trip: `new Date(selectedDate)` parses `"2026-07-21"` as **UTC** midnight, which is 20 Jul locally in all US timezones — so a re-opened calendar highlights the wrong day. | `components/Calendar.tsx:23` |
| B4 | **Medium** | Date/time desync: pick day A + a time, then click day B. `activeDay` changes but `selectedDate`/`selectedTime` still hold day A. "Continue to Payment" stays enabled and books **day A** while the UI shows day B highlighted. | `components/Calendar.tsx:84`, `StepCalendar.tsx:26` |
| B5 | **Medium** | Flagship "Luxury Package" Book Now button leads to an empty cart. `ServicesGrid.tsx:79` sends `'luxury-package'`, and `BookingModal.tsx:47` explicitly filters that value out, so the modal opens with **zero services selected**. | `ServicesGrid.tsx:79`, `BookingModal.tsx:47` |
| B6 | **Medium** | `luxuryPackage.startingPrice` is hardcoded at `1950` in `data/services.ts:88`, entirely disconnected from `lib/pricing.ts`. Change a service price and the flagship price silently becomes a lie. | `data/services.ts:88` |
| B7 | **Medium** | Dead-end render: `{step === 2 && estimate && ...}` and `{step === 4 && estimate && ...}`. If `estimate` is ever `null` at those steps the modal body renders **empty** — no content, no Back button, no recovery except closing. Currently unreachable but one prefill change away from being a trap. | `BookingModal.tsx:145,157` |
| B8 | **Low** | Framer Motion animations ignore `prefers-reduced-motion`. The CSS override in `globals.css:20-30` only neutralizes CSS transitions; Framer animates via inline style/WAAPI and is unaffected. The 2.2 s hero zoom still plays for users who asked it not to. | `globals.css:20`, all `motion.*` components |
| B9 | **Low** | Firefox: comparison slider thumb unstyled (`::-moz-range-thumb` missing). | `Gallery.tsx:47` |

---

## 5. Missing functionality

### 5.1 Customer identity capture — **CRITICAL**
The booking flow collects vehicle, services, date, time, and payment preference. It **never asks
for name, email, or phone.** Even with a database and Twilio wired up, there would be nothing to
save or send to. This is the single highest-priority gap and blocks §3.1, §3.2, and the entire
estimate-submission requirement.

### 5.2 Multi-industry support (Automotive / Marine / Aviation)
**0% implemented.** There is no `Industry` type, no industry state, no industry-conditional
data. `lib/types.ts` hardcodes automotive concepts (`VehicleSize = sedan|coupe|suv|truck|exotic`).
Required: industry selection in the hero, and industry-driven switching of hero image, headline,
subheadline, services, vehicle types, pricing, terminology, icons, and CTA copy.

### 5.3 Vehicle/vessel/aircraft database
No make/model dataset exists. ~106 manufacturers and their model lines are required across four
categories (auto, motorcycle, marine, aviation).

### 5.4 Real pricing engine
`lib/pricing.ts` prices (`paint-correction: $650`, `ceramic-coating: $900`, `ppf: $2400`) are
invented placeholders — the file says so in its own header comment. **None of them match your
actual price list.** Your list is structured completely differently: fixed prices per
(service × body style), not base-price × size-multiplier. Also missing: add-ons (clay bar
decontamination), motorcycle service tier, and the 3-Year Ceramic Coating product. The engine
needs replacing, not tuning. Marine and aviation pricing was not supplied at all.

### 5.5 Backend — all of it
No API routes, no server actions, no validation layer, no rate limiting, no persistence,
no admin view of incoming requests.

### 5.6 Standard Next.js pages
Missing `app/not-found.tsx`, `app/error.tsx`, `app/loading.tsx`, `app/sitemap.ts`,
`app/robots.ts`, favicon/`icon.png`, `metadataBase` (Open Graph images will fail to resolve).

### 5.7 Legal / compliance pages
No privacy policy, no terms of service, no cookie notice. Required before taking payments or
sending SMS (carriers require a published privacy policy for A2P 10DLC registration).

---

## 6. UI issues

1. **`appearance-none` on every `<select>`** (`BookingCard.tsx:52,86`, `StepVehicle.tsx:47`)
   strips the dropdown arrow, leaving no visual affordance that the control is a dropdown.
2. **The dropdown legibility bug you reported.** Root cause: `.input-field`
   (`globals.css:62`) sets `text-white` on the `<select>`. `<option>` elements inherit that
   colour but render inside an **OS-drawn popup with a white background** on Windows/Chrome →
   **white text on white**. Items only become readable when hovered, because hover applies the
   OS highlight background. No `option` styling exists anywhere in the codebase. Fix requires an
   explicit `select option { background: #1A1A1A; color: #FFF; }` rule (plus `color-scheme`),
   not a per-component patch.
3. **Disabled placeholder options** (`<option value="" disabled>Make</option>`) render greyed and
   are indistinguishable from a disabled control.
4. **Fake "before" images** (§2.5) undercut the gallery's credibility.
5. Hero headline `text-[13vw]` on very narrow phones (≤320 px) combined with `pt-40` + booking
   card can overflow `100svh`.
6. No `loading` / `disabled` state anywhere except the payment button — no user feedback on any
   other action.

---

## 7. Mobile responsiveness issues

Broadly good — sensible breakpoints, `svh` units, sticky bar with matching body padding.
Remaining issues:

1. Hero vertical overflow on small viewports (see §6.5).
2. `ProgressIndicator` labels are `hidden sm:block`, so on mobile the wizard shows six anonymous
   bars with no indication of what step you're on or how many remain.
3. Booking modal is `max-h-[92svh]` with internal scroll, but the Continue/Back buttons are at
   the bottom of the scroll area — on a small phone the primary action is below the fold on
   several steps.
4. Calendar time-slot column stacks below the month grid, pushing slots far down; no auto-scroll
   to them after a date is tapped.
5. Gallery comparison slider is a full-bleed `<input type="range">` — on touch devices, dragging
   the image works, but vertical page scrolling started on top of the image is captured by the
   slider.

---

## 8. Accessibility issues

| # | Severity | Issue |
|---|---|---|
| A1 | **Critical** | **Booking modal is not an accessible dialog.** No `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby`, **no focus trap**, no focus restore on close, and **no Escape-key handler**. Keyboard and screen-reader users can tab out of the modal into the inert page behind it and cannot dismiss it with Escape. `BookingModal.tsx:104-120` |
| A2 | **Critical** | Same for the gallery lightbox — a `<div>` with an `onClick` close handler, no Escape, no focus management. `Gallery.tsx:105` |
| A3 | **High** | **Colour contrast failures throughout.** `text-white/30` (≈2.0:1), `text-white/15` (≈1.3:1), `text-smoke/40` (≈2.6:1), `text-smoke/50` (≈4.0:1) against `#050505`. WCAG AA requires 4.5:1 for body text. Affects eyebrows, all metadata rows, disabled calendar days, and the placeholder text. |
| A4 | **High** | Overlay click-to-close (`BookingModal.tsx:110`) has no keyboard equivalent. |
| A5 | **Medium** | Calendar day buttons expose only a bare number (`"14"`) to screen readers — no month/year/availability context. Weekday headers are single letters with duplicate values and no `abbr`/`aria-label`. |
| A6 | **Medium** | Multi-step wizard has no `aria-live` region, so step changes are silent to screen readers. `ProgressIndicator` is purely visual — no `aria-current`, no "Step 3 of 6" text. |
| A7 | **Medium** | Service selection uses `<button>` elements as checkboxes without `role="checkbox"`/`aria-checked`, or `aria-pressed`. State is conveyed by colour alone. `EstimateCalculator.tsx:66`, `StepService.tsx:26` |
| A8 | **Medium** | Payment method and deposit/full toggles are unlabelled buttons with no `aria-pressed` — same colour-only state problem. `StepPayment.tsx:36,49,80` |
| A9 | **Low** | Close button is a bare `✕` text glyph; has `aria-label` (good) but no `type="button"`. |
| A10 | **Low** | Gallery grid images all share the alt text "Detailing work sample". |
| A11 | **Low** | `prefers-reduced-motion` not honoured by Framer Motion (see B8). |
| A12 | **Low** | No skip-to-content link. |

---

## 9. Performance issues

1. **Hero image is a CSS `background-image`** (`Hero.tsx:22`), bypassing `next/image` entirely:
   no responsive `srcset`, no AVIF/WebP negotiation, no lazy/priority hint, no blur placeholder.
   It's a full-width 2400 px JPEG and it is the LCP element — this is the site's single largest
   performance problem.
2. **`app/page.tsx` is `'use client'`**, which makes the *entire page tree* a client bundle.
   Static sections (Services, Reviews, WhyChooseUs, Footer) are shipped as JS instead of being
   server-rendered. Only the interactive parts need to be client components.
3. **Framer Motion (~50 kB gz) is loaded eagerly** on first paint, largely for decorative
   scroll reveals that CSS could handle.
4. **All 6 booking steps + Calendar are in the initial bundle** even though the modal is closed
   on load. Should be `next/dynamic`.
5. **All images are hot-linked from Unsplash** — third-party DNS + TLS + no cache control of your
   own, on the critical path. No `priority` on the LCP image, no `sizes` on the gallery
   comparison images.
6. No bundle analyzer, no performance budget, no Lighthouse baseline.

---

## 10. Backend / API issues

**There is no backend.** Full stop.

- `app/api/` does not exist. Zero routes.
- Zero server actions.
- Zero server-side validation (no Zod or equivalent) — every value is trusted client state.
- **Price is computed client-side and never re-verified.** Once a payment route exists, a user
  could alter the amount in the browser before submitting unless the server recalculates from
  first principles.
- No rate limiting, no CAPTCHA, no spam protection on any submission path.
- No logging, no error reporting, no observability.
- No admin/owner interface to view or manage incoming requests.
- `.env.example` lists keys for Stripe, Google Calendar, Calendly, Square, Shopify, SendGrid, and
  Twilio — **none of these packages are installed** (`package.json` has 5 runtime dependencies:
  next, react, react-dom, framer-motion, clsx) and none are referenced in any source file.

---

## 11. Database issues

**There is no database.** No schema, no migrations, no ORM, no client, no connection string, no
seed data. `data/*.ts` are static TypeScript arrays compiled into the client bundle.

Consequence: **every booking that has ever been "made" through this app is gone.** State lives in
`useState` and is explicitly wiped 300 ms after the modal closes (`BookingModal.tsx:56-66`).

Required tables (minimum): `estimate_requests`, `bookings`, `customers`, `vehicles`, `services`,
`service_pricing`, `add_ons`, `availability`/`blocked_slots`, `payments`.

---

## 12. Security concerns

| # | Severity | Concern |
|---|---|---|
| S1 | **Critical (latent)** | **Raw card-number, expiry, and CVC `<input>` fields exist in the app** (`StepPayment.tsx:104-108`). They are currently inert, but any developer wiring them to a fetch call puts you in scope for full PCI-DSS SAQ-D. These fields must be **deleted** and replaced with Stripe Elements (an iframe that keeps card data out of your DOM entirely), not connected. |
| S2 | **High (misleading)** | The UI displays **"🔒 Stripe Secured"** and **"PCI-DSS Compliant"** (`StepPayment.tsx:118`) over a system with no Stripe integration and no compliance posture. These claims are false as shipped and should be removed until they are true. |
| S3 | **High (latent)** | No server-side price validation — client-supplied amounts would be authoritative. |
| S4 | **High (latent)** | No input validation or sanitisation anywhere. Free-text make/model/notes will flow into email templates and a database with no escaping strategy defined. |
| S5 | **Medium** | No rate limiting or bot protection. Once estimate submission triggers email + SMS, an unprotected endpoint is a **direct financial liability** — each spam submission costs real Twilio/email spend and can be weaponised for SMS-pumping fraud. |
| S6 | **Medium** | No CSP, HSTS, `X-Frame-Options`, or `Referrer-Policy` headers configured in `next.config.js`. |
| S7 | **Medium** | Collecting name + phone + email creates GDPR/CCPA obligations with no privacy policy, no consent capture, and no retention policy in place. SMS specifically requires documented opt-in consent (TCPA) — sending a confirmation SMS without a consent checkbox is a legal exposure with statutory damages per message. |
| S8 | **Low** | No `.env.local` handling documented beyond the example file; no secret-scanning. |

### 11.1 Business/legal (non-technical but material)
- `data/reviews.ts` contains **fabricated customer reviews** and a fabricated Google rating
  ("4.9 · N Google Reviews"). Publishing invented reviews and a false aggregate Google rating is
  an FTC violation (16 CFR Part 465, effective 2024) carrying civil penalties per violation.
  These must be replaced with real reviews or removed before launch.
- Service descriptions make durability claims ("years of chemical resistance", "9H hardness")
  that should be verified against the actual products used.

---

## 13. Features that look finished but are not functional

This is the list to read if you read nothing else:

| What the customer sees | What actually happens |
|---|---|
| "Pay $475" button with card fields and Stripe/PCI badges | `setTimeout(1100ms)`. No charge. Card digits are read by no code. |
| "You're booked in. A confirmation has been sent." | Nothing sent. No email/phone was ever collected. |
| The booking itself | Discarded from memory 300 ms after the modal closes. Never saved. |
| "Real-time availability — unavailable days are disabled" | `Math.sin(date) * 10000` — a hash, not a calendar. |
| Before/after gallery slider | Same photo twice; "before" is the "after" desaturated by a URL parameter. |
| "4.9 · Google Reviews" + 4 testimonials | Fabricated. |
| Studio email + phone in the footer | `hello@apexatelier.com` / `(555) 019-2244` — a reserved fictional number. |
| Flagship "Luxury Package — Book Now" | Opens the wizard with **no** services selected. |
| Estimate calculator "Book Appointment" | Silently drops every service after the first and resets vehicle size to Coupe. |

---

## 14. Gap analysis vs. the requested specification

| Requirement | Status | Effort |
|---|---|---|
| Three-industry selection (Auto/Marine/Aviation) in hero | ❌ Not started | Large |
| Industry-driven switching of image/copy/services/pricing/terminology | ❌ Not started | Large |
| 4K Ferrari 488 hero (automotive) | ❌ Generic stock photo | Small (blocked on asset sourcing) |
| 4K performance boat hero (marine) | ❌ Not started | Small (blocked on asset sourcing) |
| 4K private jet hero (aviation) | ❌ Not started | Small (blocked on asset sourcing) |
| Responsive / lazy / optimised hero images | ⚠️ Partial — CSS bg image, unoptimised | Small |
| Per-industry vehicle type lists | ❌ Not started | Small |
| Per-industry service lists | ❌ Not started | Medium |
| Dropdown legibility fix | ❌ Broken as reported | Trivial |
| Dark + light mode dropdown compatibility | ❌ App is dark-only; no light mode exists at all | Small–Medium |
| ~43 auto manufacturers + models | ❌ 9 makes, 0 models | Large (data) |
| 16 motorcycle manufacturers + models | ❌ Not started | Medium (data) |
| 27 marine manufacturers + models | ❌ Not started | Medium (data) |
| 20 aviation manufacturers + models | ❌ Not started | Medium (data) |
| Pricing engine matching your real price list | ❌ Placeholder prices, wrong structure | Medium |
| Add-on pricing (clay bar, etc.) | ❌ No add-on concept exists | Small |
| Base / add-on / total price breakdown display | ⚠️ Shows total + deposit only | Small |
| Save estimate request to database | ❌ No database | Medium |
| Customer confirmation email | ❌ Not started | Small |
| Business notification email | ❌ Not started | Small |
| Customer confirmation SMS | ❌ Not started | Medium (+ carrier registration) |
| Business owner notification SMS | ❌ Not started | Small |
| Submission captures name/phone/email/notes/preferred date | ❌ **None of these fields exist** | Small |

---

## 15. Complexity estimate for remaining work

| Workstream | Complexity | Blocked on |
|---|---|---|
| Fix dropdown legibility | Trivial | — |
| Fix defects B1–B9 | Small | — |
| Customer contact fields | Small | — |
| Industry model + state + switching | Medium | Product decisions |
| Vehicle/vessel/aircraft dataset | Large (volume) | Scope decision on model depth |
| Pricing engine rewrite | Medium | Marine/aviation prices not supplied |
| Database + schema + persistence | Medium | **DB choice needed** |
| Estimate submission API + validation + rate limiting | Medium | DB choice |
| Email integration | Small | **Provider + API key needed** |
| SMS integration | Medium | **Twilio account + 10DLC registration needed** |
| Accessibility remediation | Medium | — |
| Performance remediation | Small–Medium | — |
| Hero imagery (3 industries, 4K) | Small | **Asset licensing decision needed** |
| Payment (if kept) | Medium–High | Stripe account |
| Legal pages | Small | Business input |

---

## 16. Blocking decisions required before implementation

1. **Database.** Nothing exists. SQLite (zero-config, local file) vs. hosted Postgres
   (Supabase/Neon — needed if you deploy to Vercel, whose filesystem is ephemeral).
2. **Email provider.** Resend (simplest) vs. SendGrid (listed in `.env.example`). Requires an
   API key and a verified sending domain.
3. **SMS.** Twilio requires a paid account, a purchased number, and **A2P 10DLC brand/campaign
   registration**, which takes days to weeks to approve and requires a published privacy policy.
   This cannot be completed today regardless of implementation quality.
4. **Payment flow.** Your specification describes an *estimate request* flow (submit → email/SMS),
   which is not the same as the existing *deposit-taking booking* flow. Keep both, or replace the
   payment step with a request-a-quote submission?
5. **Marine and aviation pricing.** You supplied automotive and motorcycle prices only. Marine and
   aviation prices must be provided or I will derive placeholders (which reintroduces exactly the
   problem this audit flags).
6. **Hero imagery.** I cannot generate or download licensed 4K photography of a red Ferrari 488, a
   performance boat, or a private jet, and I cannot visually verify that a given stock-photo URL
   depicts the correct subject. This requires either purchased/licensed assets you provide, or an
   accepted approximation via a stock provider.

---

*End of audit. No source files were modified during this audit.*

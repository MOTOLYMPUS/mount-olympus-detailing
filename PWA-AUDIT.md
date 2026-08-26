# PWA Build — Final Audit

Extension of the Mount Olympus Detailing marketing site into an installable
Progressive Web App with customer, employee, and business management.

**Status:** `tsc --noEmit` clean · `next build` clean (30 pages, 42 API routes) ·
**72/72 smoke tests passing** against the production build.

---

## 1. Repository architecture

One codebase, one database, one pricing engine. No second front end was created.

```
app/
  page.tsx                    Marketing site (unchanged)
  layout.tsx                  MODIFIED — manifest, icons, SW registrar, offline banner
  (auth)/                     NEW  /login /register /forgot-password /reset-password
  app/                        NEW  Customer PWA        (/app/*)
  staff/                      NEW  Employee portal     (/staff/*)
  admin/                      NEW  Business management (/admin/*)
  api/                        42 route handlers (1 pre-existing, 41 new)

lib/
  db.ts                       MODIFIED — 24-table schema + seed (was 1 table)
  models.ts                   NEW — platform domain model
  repo/*.ts                   NEW — 11 repositories; ALL SQL lives here and in db.ts
  auth.ts rbac.ts guards.ts   NEW — scrypt, ranked roles, page guards
  api.ts ratelimit.ts         NEW — withAuth() wrapper, SQLite-backed limiter
  availability.ts timezone.ts NEW — scheduling engine, DST-correct Intl arithmetic
  booking.ts                  NEW — booking orchestration
  uploads.ts                  NEW — magic-byte-sniffed file handling
  ai.ts push.ts stripe.ts     NEW — Claude, Web Push (RFC 8291/8292), Stripe
  csv.ts periods.ts           NEW — RFC 4180 CSV, reporting date ranges
  recommendations.ts          NEW — maintenance reminder rules

public/                       NEW — manifest, service worker, icons, offline page
```

**Layering rule:** pages → `lib/repo/*` → `lib/db.ts`. Nothing outside `db.ts` and
`repo/` contains SQL, so a Postgres migration is confined to twelve files.

---

## 2. New features

| Area | Delivered |
|---|---|
| **PWA** | Manifest, hand-written service worker (no Workbox), 7 generated icons, offline page, install prompt (incl. iOS Add-to-Home-Screen path), Web Push, Background Sync scaffolding |
| **Accounts** | Register, sign in, sign out, password reset, password change, profile |
| **Garage** | Multi-vehicle across all 3 industries — cars/trucks/SUVs/motorcycles, boats/PWC/yachts, aircraft/helicopters. Year, make, model, trim, colour, VIN, plate, notes |
| **Dashboard** | Upcoming + history, invoices, quotes, before/after photos, loyalty, membership, saved vehicles, recommended services, maintenance reminders (ceramic-coating intervals, wash cadence) |
| **Booking** | 5-step flow: vehicle → services → location → time → confirm. Live availability, reschedule, cancel-by-policy, email/SMS confirmations, reminders |
| **Availability** | Business hours, per-employee shifts, approved time off, holidays, travel time, buffers, minimum notice, max advance. **Double-booking prevented** |
| **Estimates** | View, accept, decline; guest quotes linked by email once the customer registers |
| **AI assistant** | Claude, system prompt built at runtime from the real pricing tables (all 138 price cells verified present), `[[ESCALATE]]` → email to a human, history for signed-in users |
| **Employee portal** | Today's schedule, job start/pause/resume/complete with a restart-proof timer, before/after/progress photos, checklist, materials, signature capture, completion notes |
| **Business dashboard** | Revenue today/week/month/year with trends, revenue by employee/service/industry/customer, daily revenue chart, conversion, repeat rate, employee leaderboard |
| **Admin** | Employees (CRUD, roles, rates, shifts, time off, password reset), customers, appointments, estimates, holidays, service areas, membership plans, business hours, settings |
| **Messaging** | Direct, group, announcements, job threads, attachments, mentions, read receipts, search |
| **Loyalty** | Points ledger, 4 tiers with automatic discounts, referral codes, memberships |
| **Payments** | Stripe Checkout (deposits, balances, tips, refunds), invoices, payment history — with a full manual/cash fallback |
| **Reporting** | Revenue, employees, customers, services, appointments, memberships → **CSV** |
| **Security** | RBAC, audit log, rate limiting, upload sniffing, IP hashing, input validation |

---

## 3. Existing features reused (not rebuilt)

- **`lib/pricing.ts`** — `calculateEstimate()` prices bookings *and* the AI assistant's answers. One engine.
- **`lib/industries.ts`** — the industry → type → size cascade drives the garage form and the booking flow unchanged.
- **`data/pricing/*` and `data/vehicles/*`** — untouched. Editing a price changes the site, the app, and the assistant simultaneously.
- **`lib/notify.ts`** — Resend/Twilio pattern extended by `notify-account.ts`, same graceful degradation.
- **`lib/security.ts`** — `hashIp()`, `generateReference()` reused for sessions and appointments.
- **`lib/validation.ts`** — `normalizePhone()`, `toE164()`, and its `clean()` idiom reused verbatim.
- **`components/Field.tsx`** — every new form uses the existing accessible controls.
- **Tailwind tokens** — `obsidian`/`apex`/`muted`/`subtle` and the WCAG-checked greys. No new palette.
- **`app/api/estimates/route.ts`** — unchanged. Its 22 original tests still pass.

---

## 4. Files modified (6)

| File | Change |
|---|---|
| `lib/db.ts` | 1 table → 24. Existing estimate functions and their signatures unchanged |
| `app/layout.tsx` | Manifest/icon links, `appleWebApp`, SW registrar, offline banner. Fonts, metadata, `robots: noindex` preserved |
| `next.config.js` | CSP += `manifest-src`/`worker-src`; `/sw.js` served `no-cache` |
| `package.json` | 6 scripts added. **Zero new dependencies** |
| `.env.example` | Uploads, Stripe, VAPID, Anthropic, cron sections |
| `.gitignore` | `uploads/` |
| `README.md` | App documentation |

## 5. Files created (~150)

42 API routes · 34 pages · 47 components · 38 lib modules · 5 scripts · PWA assets.
Full list from `find app components lib scripts public -type f`.

---

## 6. Database changes

**23 new tables**, all `CREATE TABLE IF NOT EXISTS` — the migration is idempotent and
runs on boot. `estimate_requests` is **untouched**; existing data survives.

`users` `sessions` `password_resets` `vehicles` `appointments` `jobs` `job_photos`
`employee_schedules` `time_off` `holidays` `service_areas` `settings`
`loyalty_accounts` `loyalty_events` `membership_plans` `memberships`
`payments` `invoices` `gift_cards` `promotions`
`conversations` `conversation_members` `messages`
`push_subscriptions` `notifications` `assistant_conversations` `assistant_messages`
`audit_log` `rate_limits`

Seeded on first boot: business hours (mirroring `lib/business.ts`), slot interval,
buffer, travel, notice, deposit %, timezone, loyalty rates.

---

## 7. API changes

**Pre-existing:** `POST /api/estimates` — unchanged.

**New (41):** `/api/auth/{register,login,logout,password}` · `/api/me` ·
`/api/vehicles[/:id]` · `/api/availability` · `/api/appointments[/:id]` ·
`/api/estimates/:id` · `/api/jobs/:id{,/status,/photos}` · `/api/uploads` ·
`/api/files/*` · `/api/assistant[/:id]` · `/api/messages[/:id,/search]` ·
`/api/notifications[/read]` · `/api/push/{subscribe,unsubscribe,vapid}` ·
`/api/payments[/webhook]` · `/api/invoices[/:id]` · `/api/loyalty` ·
`/api/memberships` · `/api/admin/{employees,settings,holidays,service-areas,plans,estimates}` ·
`/api/reports` · `/api/cron/reminders`

Every protected route is declared as `withAuth(<requirement>, handler)`. There is no
way to define a handler without stating who may call it.

---

## 8. Remaining configuration

**Required before launch**

1. `npm run create-admin -- "Your Name" you@example.com` — the only way to create the
   first owner. Deliberately a local command, not a web route.
2. `NEXT_PUBLIC_SITE_URL` — password-reset and booking links are built from it.
3. `IP_HASH_SALT` — without it, rate limits reset on every restart.
4. Set the timezone in **Admin → Settings** (defaults to `America/Chicago`).
5. Review business hours, buffer, travel time, notice period, cancellation window.

**Required for a persistent deployment**

6. A host with a **persistent filesystem** (VPS, Fly, Railway, a container with a
   volume). SQLite and `uploads/` are both on disk. **Vercel/Netlify will lose both.**
7. Back up `data.sqlite` *and* `uploads/` together — the photos are meaningless without
   the rows that reference them.

**Optional, each degrades cleanly**

8. `CRON_SECRET` + an external scheduler hitting `POST /api/cron/reminders`.
   **Unset = no reminders are ever sent.**

---

## 9. Required API keys

| Service | Variables | Without it |
|---|---|---|
| Resend | `RESEND_API_KEY`, `MAIL_FROM` | No email at all — **including password resets** |
| Twilio | `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER` | No SMS |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications appear in-app only |
| Anthropic | `ANTHROPIC_API_KEY` | Assistant returns a phone-number fallback |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments recorded as manual/cash |

A VAPID pair was generated during the build — see the chat transcript, or run
`npm run generate-vapid` for a fresh one.

## 10. Missing production credentials

**None are present.** Every integration is unconfigured and every one degrades
gracefully. The app is fully usable today for booking and job management with no
external account whatsoever.

The one that matters most: **without Resend, password reset silently cannot deliver.**
The API still returns success (by design — it must not confirm whether an account
exists), so a user would wait for an email that never arrives.

---

## 11. Security

**Implemented**

- **Passwords** — scrypt (N=16384, r=8, p=1), per-password salt, self-describing hash
  so cost can be raised later. Timing-safe comparison.
- **Sessions** — 256-bit token, `httpOnly` + `SameSite=Lax` + `Secure` in production.
  Only the SHA-256 is stored, so a DB leak yields no usable sessions. Revoked
  server-side on sign-out and on every password change.
- **No account enumeration** — login, registration and password reset return identical
  responses for known and unknown addresses; a decoy KDF equalises the timing.
  *Asserted by three separate smoke tests.*
- **RBAC** — ranked roles. Nobody may grant a role at or above their own; an owner
  cannot be demoted or deactivated by anyone. Object-level checks pair role with
  ownership, so an employee reaches their job and no one else's.
- **404, not 403,** for records you may not see — a 403 confirms the id exists.
- **Price integrity** — the server recomputes every total from `data/pricing`.
  *Asserted: a booking posting `quotedTotal: 1` stores $295.*
- **Uploads** — magic-byte sniffing (SVG deliberately rejected as a stored-XSS vector),
  client filenames discarded, UUID names, path-traversal guards, 8 MB cap, served
  through an authenticated route with a sniffed `Content-Type` and `nosniff`.
- **Rate limiting** — SQLite-backed so it survives restarts. Login limited by IP *and*
  by hashed email, so one attacker cannot lock out an office and a botnet cannot spray
  one account.
- **Audit log** — append-only, secret-redacting, covering auth, roles, bookings, jobs,
  payments, settings and exports.
- **Webhooks** — Stripe signatures verified with HMAC-SHA256 and a 5-minute replay
  window. *12/12 verifier tests pass, including tamper and expiry.*
- **CSP** — `frame-ancestors 'none'`, `object-src 'none'`, no `unsafe-eval` in production.
- **PII** — IPs hashed before storage; `uploads/` and `*.sqlite` git-ignored.

**Recommendations, in priority order**

1. **CSRF tokens.** `SameSite=Lax` blocks the common cross-site POST, but it is not a
   complete defence (it permits top-level GET navigations, and older browsers vary).
   Add a double-submit token for state-changing routes.
2. **Per-object authorisation on `/api/files/*`.** Any signed-in user who knows a UUID
   can fetch any upload. UUIDs are unguessable, so this is defence-in-depth rather than
   an open door — but signatures and vehicle photos deserve an owner check. Add an
   `uploads` table mapping key → owner.
3. **Encrypt signatures at rest.** They are biometric-adjacent under BIPA/CCPA.
4. **Email verification.** Addresses are currently unverified, so the profile screen
   correctly refuses to let users change theirs.
5. **2FA for owner/admin**, given the accounts can see all revenue and all customers.
6. **Move rate limiting to Redis** if you ever run more than one process — the current
   fixed-window counter allows a 2× burst across a window boundary.
7. **Tighten `script-src` with a nonce**, replacing `'unsafe-inline'`.
8. **Publish a privacy policy and terms** — required for A2P 10DLC SMS registration and
   for GDPR/CCPA now that you store names, phones, addresses, photos and signatures.

---

## 12. Performance

**Done:** server components by default (the whole customer dashboard ships ~94 kB of
JS); dynamic import kept on the estimate wizard; indexes on every foreign key and
date-range column; aggregates computed in SQL; CSS-only charts (no charting library);
service-worker caching — cache-first for content-hashed assets, stale-while-revalidate
for images, network-first for navigation; `loading="lazy"` on photos.
**Zero new dependencies** — the entire platform runs on the original five.

**Recommendations**

1. **N+1 queries** in `/admin/customers` (spend per row) and `/staff/jobs` (appointment
   per job). Fine at hundreds of rows; add a repo aggregate before thousands.
2. **`revenueByService` aggregates in JS** because service ids live in a JSON column.
   Normalise to an `appointment_services` join table at scale.
3. **Uploads are unprocessed.** An 8 MB phone photo is served at 8 MB. Add server-side
   resizing (`sharp`) or an image CDN — the single biggest available win.
4. **The AI system prompt (~14.7 kB) is re-sent uncached on every message.** Anthropic
   prompt caching would cut input cost sharply; the prompt is byte-stable between
   catalogue edits.
5. **Messaging polls** (8 s focused, 60 s hidden). Fine for a small team; needs SSE or
   WebSockets beyond ~20 concurrent staff.
6. **Invoice numbering is not concurrency-safe** — derived from a `COUNT`. Move to a
   counter table before multi-user invoicing.

---

## 13. Testing

**Present:** 72 automated assertions, all passing against the production build.
`npm test` (22 — estimate pricing and tampering) and `npm run test:app` (50 — auth,
enumeration, privilege escalation, horizontal access control, availability, double
booking, price integrity, headers, PWA assets). Plus verifier scripts proving the AI
prompt contains all 138 real price cells, Stripe signature verification (12 cases), and
Web Push encryption decrypting correctly with a real ECDH keypair.

**Recommended next**

1. **Unit tests for `lib/availability.ts`** — the highest-value untested surface.
   Specifically DST transitions, split shifts, and travel/buffer overlap arithmetic.
2. **A concurrent double-booking test** — two simultaneous POSTs for one slot. The
   current test is sequential; SQLite serialises writes so it should hold, but it is
   unproven under real concurrency.
3. **Employee and admin flow tests** — the smoke suite covers customers thoroughly and
   staff only lightly.
4. **A real device install matrix** — iOS Safari, Android Chrome, Edge desktop. iOS is
   the one that will surprise you.
5. **Stripe replay tests** with the Stripe CLI, including duplicate deliveries.
6. **Automated accessibility** (axe) — the components were built to be accessible
   (real radios for star ratings, focus management, `aria-live` regions) but this is
   unverified by tooling.
7. **A restore drill.** Untested backups are not backups.

---

## 14. Partially implemented — be aware

| # | Item | What is missing |
|---|---|---|
| 1 | **PDF / Excel export** | CSV is complete and correct. `?format=pdf\|xlsx` returns **501 with an explanation** rather than a broken file. Both need a dependency this build does not have. |
| 2 | **Background Sync** | The service worker's queue and drain logic are real and correct, but **no form enqueues into it yet**. The wire format is documented in `sw.js`. |
| 3 | **Memberships are not subscriptions** | Checkout is a one-off charge; `renewsAt` is stored but **nothing bills it**. Needs Stripe Prices + `customer.subscription.*` webhooks. |
| 4 | **Estimate → booking conversion** | Marks the estimate scheduled and opens the booking flow pre-filled. It does not auto-create the appointment: an estimate may have no account behind it, and silently minting one produces a customer who cannot sign in. |
| 5 | **Apple splash screens** | Skipped. iOS falls back to background colour + icon. Needs ~8 device-specific PNGs and `<link rel="apple-touch-startup-image">` tags. |
| 6 | **iOS push** | Works only once the app is added to the Home Screen (iOS 16.4+). The UI detects and explains this. Apple's restriction, not a defect. |
| 7 | **Live messaging** | Polling, not push. |
| 8 | **Stripe is unverified against live Stripe** | Only the signature verifier is proven. Register the webhook and replay both event types before taking money. |
| 9 | **Gift cards & promotions** | Tables exist; **no UI and no redemption logic**. |
| 10 | **Free-service loyalty rewards** | Points, tiers and tier discounts work. Automatic redemption *rules* are not implemented. |
| 11 | **Saved payment methods** | Not implemented — Stripe Checkout does not surface them without a Customer object. |
| 12 | **Inventory reporting** | No inventory model. Materials are recorded per job only. |
| 13 | **Shift editor: one block per weekday** | The schema supports split shifts; the editor cannot express one. |
| 14 | **Email change** | Not offered — it needs a verification flow that does not exist. |
| 15 | **Job photos not deleted from disk** | Detaching leaves the file. Needs a sweeper. |
| 16 | **AI prompt injection** | The model has no tools and cannot write to the DB or move money, and prices are grounded in the prompt. But it can be argued into *stating* a wrong price in chat. Consider a visible "quotes are not binding" line. Escalation emails contain attacker-controlled text (HTML-escaped, so not XSS) — treat them as untrusted. |
| 17 | **Reschedule uses the browser timezone** in the admin UI | Correct for staff in the shop's zone; a remote manager needs a picker. |

---

## Pre-existing launch blockers (unchanged, from the original audit)

Still outstanding and **not** addressed by this work:

1. `data/media.ts` — all imagery is Unsplash stock.
2. `data/reviews.ts` / `data/gallery.ts` — emptied for FTC compliance; repopulate with real work.
3. Marine and aviation pricing are placeholders (flagged in the UI, and the AI assistant discloses it).
4. `robots: noindex` is still set in `app/layout.tsx`. Flip it when the above are resolved.
5. No privacy policy or terms.

---

## Addendum — visual design pass

Added after the functional build. Full detail in `VISUAL-SYSTEM.md`.

**Measured, not asserted:**

| Metric | Result |
|---|---|
| Decorative CSS system, gzipped | **3.2 KB** (vs 180–400 KB for one texture JPEG) |
| Frame rate, all layers running | **60–61 FPS** |
| Cumulative Layout Shift, home page, mobile, full scroll | **0** (CWV threshold is 0.1) |
| Text contrast failures — home page | **0 / 211** elements |
| Text contrast failures — `/app` | **0 / 51** |
| Text contrast failures — `/login` | **0 / 12** |
| Horizontal overflow at 375px | none |
| Images lazy-loaded | 20 of 21 (the 1 eager is the hero LCP) |
| Extra network requests added to the hero | 1 |

**One real accessibility bug found and fixed.** The brand red `#D4001A` as a
TEXT colour on `#050505` is **3.7:1** — under the 4.5:1 AA floor. It was the
colour of every form **error message**, the required-field asterisk, and half
the logo lockup. Error text is the worst possible place for a sub-threshold
colour: it is read under pressure, often by the people who most need contrast.

Fixed at the token level rather than per-site: `flare` (`#FF3B4A`, **5.7:1**)
added to `tailwind.config.ts` and swapped in across 56 occurrences in 35 files.
`apex` remains the surface colour — white on an apex button is 5.5:1 and was
always fine. **Rule: `bg-apex` for surfaces, `text-flare` for type.**

This bug predates the visual pass; it was found because the pass added an
automated contrast audit rather than eyeballing screenshots.

**Not built, deliberately** — see the honesty rules in `VISUAL-SYSTEM.md`:
before/after gallery left empty (component fully built, designed empty state),
no "our work"/"customers"/"team" sections, no animated statistics. The mosaic
carries a visible disclosure and is captioned "Reference Gallery".

**Known limitation:** `sizes` is absent on the customer-photo grids. Those are
plain `<img>` on `/api/files/*`; without `srcset` a `sizes` attribute is inert
markup. Server-side image resizing (item 3 under Performance above) is the real
fix and remains outstanding.

---

## Test data note

The development database now contains smoke-test accounts (`smoke-*@example.com`,
`browser-*@example.com`) and an owner `smoke-owner@example.com`. Delete `data.sqlite`
before going live, then re-run `npm run create-admin`.

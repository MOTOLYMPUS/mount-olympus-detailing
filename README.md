# Apex Detailing Atelier

Luxury automotive detailing website — Next.js 14 (App Router), TypeScript, Tailwind CSS,
Framer Motion. Built for paint correction, ceramic coating, PPF, and full detail services
for exotic/luxury vehicle owners.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Project structure

```
app/                    Next.js App Router entry (layout, page, global styles)
components/             Reusable UI components
  BookingFlow/           6-step booking wizard (Vehicle → Service → Estimate → Calendar → Payment → Confirmation)
  Navbar, Hero, BookingCard, EstimateCalculator, ServicesGrid, Gallery, Reviews, WhyChooseUs, Footer, Calendar
lib/                    Business logic — pricing engine, availability engine, shared types
data/                   Mock content — services, reviews, gallery images
```

## What's real vs. placeholder

**Real / working today:**
- Instant estimate calculator (vehicle size × selected services → price, hours, deposit, completion date) — see `lib/pricing.ts`
- Full 6-step booking flow with client-side state and validation
- Calendar UI with disabled days/past dates and per-slot availability — currently backed by a deterministic mock in `lib/availability.ts`
- Responsive layout, mobile sticky Book Now bar, reduced-motion support, visible focus states

**Placeholder — wired for, not connected to, live services:**
- **Payment** (`components/BookingFlow/StepPayment.tsx`): UI for card / Apple Pay / Google Pay and deposit-vs-full toggle. Replace the `setTimeout` in `BookingModal.tsx`'s `handlePay` with a real Stripe PaymentIntent create + confirm call (client secret from a `/api/create-payment-intent` route you add).
- **Live availability** (`lib/availability.ts`): swap `getSlotsForDate` for a fetch to Google Calendar API, Calendly, or Square Appointments — same return shape (`TimeSlot[]`) so no component changes are needed.
- **Confirmation emails/SMS**: hook into SendGrid/Twilio after a successful `handlePay`.
- **CRM**: push the `BookingState` object to your CRM of choice on confirmation.

Fill in `.env.example` → `.env.local` as you connect each service.

## Design tokens

Colors, type scale, and spacing live in `tailwind.config.ts`. The accent red
(`apex`, `#D4001A`) is intentionally reserved for CTAs, hover, active nav, and
booking/calendar highlights — don't use it decoratively elsewhere, per the brand brief.

## Images

Hero and service imagery currently point to Unsplash placeholders. Swap the URLs in
`data/services.ts`, `data/gallery.ts`, and `components/Hero.tsx` for real photography —
the brief calls for the vehicle itself (Ferrari 488/SF90/F8 or Porsche GT3 RS/Turbo S/GT4 RS)
as the hero centerpiece, not stock detailing photos.

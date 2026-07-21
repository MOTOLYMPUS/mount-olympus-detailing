// ─────────────────────────────────────────────────────────────────────────────
// Business identity and contact details.
//
// Single source of truth — the brand name, contact email, phone numbers, hours,
// and booking link all resolve from here. Nothing else in the codebase hardcodes
// them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contact details are now real, so the footer setup banner is off.
 * Set back to true if these ever revert to placeholders.
 */
export const BUSINESS_DETAILS_ARE_PLACEHOLDER = false;

/** Digits only. Used to build tel: links and E.164 numbers. */
const PRIMARY_DIGITS = '4693901255';
const BACKUP_DIGITS = '4692031543';

function pretty(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * PUBLIC contact details — safe to render anywhere. Everything in this object
 * is intended to be seen by customers.
 */
export const business = {
  name: 'Mount Olympus Detailing',

  /** Split for the two-tone logo lockup in the navbar and footer. */
  logo: { lead: 'MOUNT OLYMPUS', tail: 'DETAILING' },

  email: 'Luis.rodriguez621@outlook.com',

  phone: pretty(PRIMARY_DIGITS),
  phoneDigits: PRIMARY_DIGITS,
  phoneHref: `tel:+1${PRIMARY_DIGITS}`,

  // 12-hour clock with AM/PM — what US customers expect.
  hours: [
    { days: 'Mon – Fri', time: '8:00 AM – 7:00 PM' },
    { days: 'Saturday', time: '8:00 AM – 5:00 PM' },
    { days: 'Sunday', time: 'Closed' },
  ],

  serviceArea: 'By appointment · mobile service available',
};

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  INTERNAL — NEVER RENDER THIS IN A COMPONENT.
//
// Deliberately kept OUT of the `business` object above so it cannot be reached
// by anything that renders `business.*`, and so a future `Object.entries`
// over the public details can never sweep it into the page.
//
// This number receives booking notifications only. It is not a customer-facing
// contact and must not appear in the footer, on any page, in metadata, or in
// structured data.
//
// It is referenced in exactly one place: the owner-SMS failover in
// lib/notify.ts, which runs server-side. `lib/notify.ts` is imported only by
// the API route, so this value is never serialised into the client bundle.
// ─────────────────────────────────────────────────────────────────────────────
export const internalNotificationTargets = {
  /** Failover SMS recipient — only messaged if the primary number fails. */
  backupPhoneDigits: BACKUP_DIGITS,
};

/**
 * Optional online booking page — Calendly, Google Calendar appointment
 * schedule, Square Appointments, or anything else with a public URL.
 *
 * When `BOOKING_URL` is set, a "Book your slot" call to action appears on the
 * confirmation screen and in the customer's confirmation email. When it is
 * unset, both quietly omit it and you schedule by phone — no broken link, no
 * dead button.
 */
export const bookingUrl = process.env.NEXT_PUBLIC_BOOKING_URL?.trim() || null;

/**
 * Absolute site URL. Drives canonical + Open Graph URLs.
 * Falls back to localhost so development works with nothing configured.
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') || 'http://localhost:3000';

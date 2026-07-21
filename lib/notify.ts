// ─────────────────────────────────────────────────────────────────────────────
// Email + SMS notifications.
//
// Both providers are called over plain `fetch` — no SDKs, no dependencies.
//
// GRACEFUL DEGRADATION: when a provider's env vars are absent, the send is
// skipped and logged rather than throwing. A submission is never lost because
// a notification could not go out; the outcome of each channel is recorded on
// the row (`notify_email_status` / `notify_sms_status`) so nothing fails
// silently.
//
// Required env vars — see .env.example:
//   RESEND_API_KEY, MAIL_FROM, BUSINESS_EMAIL          (email)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//   TWILIO_PHONE_NUMBER, BUSINESS_PHONE                (SMS)
// ─────────────────────────────────────────────────────────────────────────────

import { bookingUrl, business, internalNotificationTargets } from './business';
import { getIndustry, sizeLabel } from './industries';
import { formatCurrency, formatPrice } from './pricing';
import { getAddOn, getService } from '@/data/pricing';
import { EstimateRequestRecord } from './types';
import { toE164 } from './validation';

export type ChannelStatus = 'sent' | 'skipped:not-configured' | 'skipped:no-consent' | string;

export interface NotifyOutcome {
  customerEmail: ChannelStatus;
  businessEmail: ChannelStatus;
  customerSms: ChannelStatus;
  businessSms: ChannelStatus;
}

// ── Config ───────────────────────────────────────────────────────────────────

const resendKey = () => process.env.RESEND_API_KEY?.trim();
const mailFrom = () => process.env.MAIL_FROM?.trim();

// Recipients default to the details in lib/business.ts, so notifications reach
// the owner with no environment configuration at all. The env vars exist purely
// to redirect them (e.g. to a shared inbox) without touching code.
const businessEmail = () => process.env.BUSINESS_EMAIL?.trim() || business.email;
const businessPhone = () => process.env.BUSINESS_PHONE?.trim() || business.phoneDigits;
const businessPhoneBackup = () =>
  process.env.BUSINESS_PHONE_BACKUP?.trim() ||
  internalNotificationTargets.backupPhoneDigits;

const twilioSid = () => process.env.TWILIO_ACCOUNT_SID?.trim();
const twilioToken = () => process.env.TWILIO_AUTH_TOKEN?.trim();
const twilioFrom = () => process.env.TWILIO_PHONE_NUMBER?.trim();

export const emailConfigured = () => !!(resendKey() && mailFrom());
export const smsConfigured = () => !!(twilioSid() && twilioToken() && twilioFrom());

// ── Formatting helpers ───────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lineItems(r: EstimateRequestRecord) {
  const services = r.serviceIds.map((id) => getService(id)).filter(Boolean);
  const addOns = r.addOnIds.map((id) => getAddOn(id)).filter(Boolean);
  return {
    serviceNames: services.map((s) => s!.name),
    addOnNames: addOns.map((a) => a!.name),
  };
}

function quoteText(r: EstimateRequestRecord): string {
  return formatPrice(r.quotedTotal, r.quotedTotalMax);
}

function prettyPhone(digits: string): string {
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : digits;
}

const BRAND = business.name;

/** Shown wherever the quote came from an uncalibrated price table. */
const PLACEHOLDER_WARNING =
  'This figure is indicative only — pricing for this industry has not yet been ' +
  'finalised and will be confirmed before any work is scheduled.';

// ── Email ────────────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: mailFrom(), to: [to], subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

function customerEmailBody(r: EstimateRequestRecord) {
  const cfg = getIndustry(r.industry);
  const { serviceNames, addOnNames } = lineItems(r);

  const rows = r.serviceIds
    .map((id) => {
      const s = getService(id);
      if (!s) return '';
      const p = s.prices[r.sizeClass];
      return `<tr><td style="padding:6px 0">${esc(s.name)}</td><td align="right">${
        p ? formatPrice(p.price, p.priceMax) : '—'
      }</td></tr>`;
    })
    .join('');

  const addOnRows = r.addOnIds
    .map((id) => {
      const a = getAddOn(id);
      if (!a) return '';
      const p = a.prices[r.sizeClass];
      return `<tr><td style="padding:6px 0">+ ${esc(a.name)}</td><td align="right">${
        p ? formatPrice(p.price, p.priceMax) : '—'
      }</td></tr>`;
    })
    .join('');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h1 style="font-size:20px;margin:0 0 4px">Thanks, ${esc(r.name.split(' ')[0])} — we've got your request.</h1>
  <p style="color:#555;margin:0 0 20px">Reference <strong>${esc(r.reference)}</strong></p>

  <p style="margin:0 0 16px">We'll review the details and get back to you shortly to confirm timing and final pricing.</p>

  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:24px 0 8px">Your ${esc(cfg.noun)}</h2>
  <p style="margin:0">${esc(r.year)} ${esc(r.make)} ${esc(r.model)}<br>
  <span style="color:#666">${esc(sizeLabel(r.sizeClass))}</span></p>

  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:24px 0 8px">Estimate</h2>
  <table width="100%" style="border-collapse:collapse;font-size:14px">
    ${rows}${addOnRows}
    <tr><td colspan="2" style="border-top:1px solid #ddd;padding-top:8px"></td></tr>
    <tr><td style="font-weight:600">Estimated total</td>
        <td align="right" style="font-weight:600;font-size:18px">${quoteText(r)}</td></tr>
  </table>
  <p style="color:#666;font-size:13px;margin:12px 0 0">Estimated time: ${r.estimatedHours} hours</p>
  ${
    r.isPlaceholderPricing
      ? `<p style="color:#8a5a00;background:#fff6e0;padding:10px;border-radius:4px;font-size:13px">${PLACEHOLDER_WARNING}</p>`
      : `<p style="color:#666;font-size:13px">Final pricing is confirmed after an in-person inspection.</p>`
  }
  ${r.preferredDate ? `<p style="font-size:14px">Preferred date: <strong>${esc(r.preferredDate)}</strong></p>` : ''}
  ${r.notes ? `<p style="font-size:14px;color:#555">Your notes: ${esc(r.notes)}</p>` : ''}

  ${
    bookingUrl
      ? `<p style="margin:24px 0">
           <a href="${esc(bookingUrl)}"
              style="display:inline-block;background:#D4001A;color:#fff;text-decoration:none;
                     padding:12px 22px;border-radius:3px;font-weight:600;font-size:14px">
             Book your slot
           </a>
         </p>`
      : ''
  }

  <p style="color:#666;font-size:13px;margin-top:20px">
    Questions? Call or text us on
    <a href="${business.phoneHref}" style="color:#111">${esc(business.phone)}</a>,
    or reply to this email.
  </p>

  <p style="color:#999;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:12px">
    ${esc(BRAND)} · This is an estimate request confirmation, not a booking confirmation.
  </p>
</div>`.trim();

  const text = [
    `Thanks, ${r.name.split(' ')[0]} — we've got your request.`,
    `Reference: ${r.reference}`,
    ``,
    `${cfg.noun}: ${r.year} ${r.make} ${r.model} (${sizeLabel(r.sizeClass)})`,
    `Services: ${serviceNames.join(', ')}`,
    addOnNames.length ? `Add-ons: ${addOnNames.join(', ')}` : '',
    `Estimated total: ${quoteText(r)}`,
    `Estimated time: ${r.estimatedHours} hours`,
    r.isPlaceholderPricing ? PLACEHOLDER_WARNING : 'Final pricing confirmed after inspection.',
    r.preferredDate ? `Preferred date: ${r.preferredDate}` : '',
    bookingUrl ? `\nBook your slot: ${bookingUrl}` : '',
    ``,
    `Questions? Call or text ${business.phone}.`,
    `${BRAND}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

function businessEmailBody(r: EstimateRequestRecord) {
  const cfg = getIndustry(r.industry);
  const { serviceNames, addOnNames } = lineItems(r);

  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;color:#111">
  <h1 style="font-size:18px;margin:0 0 12px">New ${esc(cfg.label)} estimate request — ${esc(r.reference)}</h1>
  <table width="100%" style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 0;color:#777;width:150px">Name</td><td>${esc(r.name)}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Phone</td><td><a href="tel:+1${esc(r.phone)}">${esc(prettyPhone(r.phone))}</a></td></tr>
    <tr><td style="padding:4px 0;color:#777">Email</td><td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td></tr>
    <tr><td style="padding:4px 0;color:#777">SMS consent</td><td>${r.smsConsent ? 'Yes' : 'No'}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Industry</td><td>${esc(cfg.label)}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Category</td><td>${esc(r.vehicleType)}</td></tr>
    <tr><td style="padding:4px 0;color:#777">${esc(cfg.noun)}</td><td>${esc(r.year)} ${esc(r.make)} ${esc(r.model)}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Size</td><td>${esc(sizeLabel(r.sizeClass))}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Services</td><td>${esc(serviceNames.join(', '))}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Add-ons</td><td>${esc(addOnNames.join(', ')) || '—'}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Quoted</td><td><strong>${quoteText(r)}</strong>${
      r.isPlaceholderPricing ? ' <span style="color:#b45309">(PLACEHOLDER PRICING)</span>' : ''
    }</td></tr>
    <tr><td style="padding:4px 0;color:#777">Est. hours</td><td>${r.estimatedHours}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Preferred date</td><td>${esc(r.preferredDate ?? '—')}</td></tr>
    <tr><td style="padding:4px 0;color:#777;vertical-align:top">Notes</td><td>${esc(r.notes) || '—'}</td></tr>
    <tr><td style="padding:4px 0;color:#777">Received</td><td>${esc(r.createdAt)}</td></tr>
  </table>
</div>`.trim();

  const text = [
    `New ${cfg.label} estimate request — ${r.reference}`,
    `Name:  ${r.name}`,
    `Phone: ${prettyPhone(r.phone)}`,
    `Email: ${r.email}`,
    `SMS consent: ${r.smsConsent ? 'Yes' : 'No'}`,
    `${cfg.noun}: ${r.year} ${r.make} ${r.model} (${sizeLabel(r.sizeClass)})`,
    `Services: ${serviceNames.join(', ')}`,
    `Add-ons: ${addOnNames.join(', ') || '—'}`,
    `Quoted: ${quoteText(r)}${r.isPlaceholderPricing ? ' (PLACEHOLDER PRICING)' : ''}`,
    `Preferred date: ${r.preferredDate ?? '—'}`,
    `Notes: ${r.notes || '—'}`,
  ].join('\n');

  return { html, text };
}

// ── SMS ──────────────────────────────────────────────────────────────────────

async function sendSms(to: string, body: string) {
  const sid = twilioSid()!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${twilioToken()}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: twilioFrom()!, Body: body }),
  });
  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  }
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Fire all four notifications. Never throws — every channel resolves to a
 * status string that the caller persists.
 */
export async function sendEstimateNotifications(
  r: EstimateRequestRecord
): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = {
    customerEmail: 'skipped:not-configured',
    businessEmail: 'skipped:not-configured',
    customerSms: 'skipped:not-configured',
    businessSms: 'skipped:not-configured',
  };

  // ── Email ──
  if (emailConfigured()) {
    const cust = customerEmailBody(r);
    const biz = businessEmailBody(r);

    const results = await Promise.allSettled([
      sendEmail(r.email, `Your ${BRAND} estimate — ${r.reference}`, cust.html, cust.text),
      sendEmail(
        businessEmail(),
        `New estimate request — ${r.make} ${r.model} — ${r.reference}`,
        biz.html,
        biz.text
      ),
    ]);

    outcome.customerEmail =
      results[0].status === 'fulfilled' ? 'sent' : `error: ${String(results[0].reason).slice(0, 200)}`;
    outcome.businessEmail =
      results[1].status === 'fulfilled' ? 'sent' : `error: ${String(results[1].reason).slice(0, 200)}`;
  } else {
    console.warn(
      `[notify] Email not configured (RESEND_API_KEY / MAIL_FROM missing). ` +
        `Request ${r.reference} saved but no email sent.`
    );
  }

  // ── SMS ──
  if (smsConfigured()) {
    const customerTo = toE164(r.phone);
    const jobs: Promise<void>[] = [];

    // TCPA: no consent, no message. This is a legal requirement, not a preference.
    if (!r.smsConsent) {
      outcome.customerSms = 'skipped:no-consent';
    } else if (!customerTo) {
      outcome.customerSms = 'error: phone not E.164-convertible';
    } else {
      jobs.push(
        sendSms(
          customerTo,
          `${BRAND}: thanks ${r.name.split(' ')[0]}! Request ${r.reference} received — ` +
            `est. ${quoteText(r)}. We'll be in touch shortly. Reply STOP to opt out.`
        ).then(
          () => void (outcome.customerSms = 'sent'),
          (e) => void (outcome.customerSms = `error: ${String(e).slice(0, 200)}`)
        )
      );
    }

    // Owner alert: primary number first, backup only if the primary fails.
    // A backup that always fires would just be two texts for every lead.
    const ownerBody =
      `New ${r.industry} request ${r.reference}: ${r.year} ${r.make} ${r.model} — ` +
      `${quoteText(r)}${r.isPlaceholderPricing ? ' (placeholder)' : ''}. ` +
      `${r.name} ${prettyPhone(r.phone)}`;

    jobs.push(
      (async () => {
        const primary = toE164(businessPhone());
        const backup = toE164(businessPhoneBackup());

        if (!primary && !backup) {
          outcome.businessSms = 'skipped:not-configured';
          return;
        }

        if (primary) {
          try {
            await sendSms(primary, ownerBody);
            outcome.businessSms = 'sent:primary';
            return;
          } catch (e) {
            console.error('[notify] primary owner SMS failed, trying backup', e);
            if (!backup) {
              outcome.businessSms = `error: ${String(e).slice(0, 200)}`;
              return;
            }
          }
        }

        try {
          await sendSms(backup!, ownerBody);
          outcome.businessSms = primary ? 'sent:backup (primary failed)' : 'sent:backup';
        } catch (e) {
          outcome.businessSms = `error: both numbers failed — ${String(e).slice(0, 160)}`;
        }
      })()
    );

    await Promise.allSettled(jobs);
  } else {
    console.warn(
      `[notify] SMS not configured (TWILIO_* missing). ` +
        `Request ${r.reference} saved but no SMS sent.`
    );
  }

  return outcome;
}

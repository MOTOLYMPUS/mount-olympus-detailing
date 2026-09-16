// ─────────────────────────────────────────────────────────────────────────────
// Transactional email and SMS for the app: password resets, booking
// confirmations, reminders, and job-completion notices.
//
// Extends lib/notify.ts rather than replacing it — the estimate flow's
// notifications are unchanged. The same rules apply here:
//
//   • Providers are called over plain `fetch`; no SDKs, no dependencies.
//   • Missing configuration SKIPS the send and logs it. Nothing throws, so a
//     booking is never lost because Resend was down.
//   • No SMS without TCPA consent on the recipient's record. That is a legal
//     requirement, not a preference.
// ─────────────────────────────────────────────────────────────────────────────

import { business, siteUrl } from './business';
import { Appointment, User } from './models';
import { formatCurrency } from './pricing';
import { getService, getAddOn } from '@/data/pricing';
import { toE164 } from './validation';
import { formatDateTime } from './timezone';
import { getSchedulingConfig } from './repo/settings';

type Status = 'sent' | 'skipped:not-configured' | 'skipped:no-consent' | string;

const resendKey = () => process.env.RESEND_API_KEY?.trim();
const mailFrom = () => process.env.MAIL_FROM?.trim();
const businessEmail = () => process.env.BUSINESS_EMAIL?.trim() || business.email;

const twilioSid = () => process.env.TWILIO_ACCOUNT_SID?.trim();
const twilioToken = () => process.env.TWILIO_AUTH_TOKEN?.trim();
const twilioFrom = () => process.env.TWILIO_PHONE_NUMBER?.trim();

const emailConfigured = () => !!(resendKey() && mailFrom());
const smsConfigured = () => !!(twilioSid() && twilioToken() && twilioFrom());

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<Status> {
  if (!emailConfigured()) {
    console.warn(`[notify-account] email not configured — "${subject}" not sent to ${to}`);
    return 'skipped:not-configured';
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: mailFrom(), to: [to], subject, html, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return 'sent';
  } catch (e) {
    console.error('[notify-account] email failed', e);
    return `error: ${String(e).slice(0, 200)}`;
  }
}

async function sendSms(user: User, body: string): Promise<Status> {
  if (!smsConfigured()) return 'skipped:not-configured';
  if (!user.smsConsent) return 'skipped:no-consent';

  const to = toE164(user.phone);
  if (!to) return 'error: phone not E.164-convertible';

  try {
    const sid = twilioSid()!;
    const auth = Buffer.from(`${sid}:${twilioToken()}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: twilioFrom()!, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    return 'sent';
  } catch (e) {
    console.error('[notify-account] sms failed', e);
    return `error: ${String(e).slice(0, 200)}`;
  }
}

// ── Shared shell so every email looks like the same business ─────────────────

function shell(heading: string, inner: string, cta?: { label: string; url: string }): string {
  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h1 style="font-size:20px;margin:0 0 16px">${esc(heading)}</h1>
  ${inner}
  ${
    cta
      ? `<p style="margin:26px 0">
           <a href="${esc(cta.url)}" style="display:inline-block;background:#D4001A;color:#fff;
              text-decoration:none;padding:12px 22px;border-radius:3px;font-weight:600;font-size:14px">
             ${esc(cta.label)}
           </a>
         </p>`
      : ''
  }
  <p style="color:#999;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:12px">
    ${esc(business.name)} · <a href="${business.phoneHref}" style="color:#666">${esc(business.phone)}</a>
  </p>
</div>`.trim();
}

// ── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(user: User, token: string): Promise<Status> {
  // The token is a URL fragment-free query parameter on purpose: it must reach
  // the server to be exchanged. It is single-use and expires in an hour.
  const url = `${siteUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const html = shell(
    'Reset your password',
    `<p style="margin:0 0 14px">Someone asked to reset the password for this account.
       If that was not you, you can ignore this email — nothing has changed.</p>
     <p style="color:#666;font-size:13px">This link expires in one hour and can only be used once.</p>`,
    { label: 'Choose a new password', url }
  );

  const text = [
    'Reset your password',
    '',
    'Someone asked to reset the password for this account.',
    'If that was not you, ignore this email — nothing has changed.',
    '',
    url,
    '',
    'This link expires in one hour and can only be used once.',
    business.name,
  ].join('\n');

  return sendEmail(user.email, `Reset your ${business.name} password`, html, text);
}

export async function sendWelcomeEmail(user: User): Promise<Status> {
  const html = shell(
    `Welcome, ${esc(user.name.split(' ')[0])}.`,
    `<p style="margin:0 0 14px">Your account is ready. You can now save your vehicles,
       book services, track your appointments, and see before-and-after photos of every job.</p>`,
    { label: 'Open your dashboard', url: `${siteUrl}/app` }
  );
  const text = `Welcome, ${user.name.split(' ')[0]}.\n\nYour account is ready.\n${siteUrl}/app\n\n${business.name}`;
  return sendEmail(user.email, `Welcome to ${business.name}`, html, text);
}

// ── Bookings ─────────────────────────────────────────────────────────────────

function serviceList(appointment: Appointment): string[] {
  return [
    ...appointment.serviceIds.map((id) => getService(id)?.name).filter(Boolean),
    ...appointment.addOnIds.map((id) => getAddOn(id)?.name).filter(Boolean),
  ] as string[];
}

export interface BookingNotifyResult {
  customerEmail: Status;
  customerSms: Status;
  businessEmail: Status;
}

export async function sendBookingConfirmation(
  user: User,
  appointment: Appointment
): Promise<BookingNotifyResult> {
  const tz = getSchedulingConfig().timezone;
  const when = formatDateTime(appointment.startsAt, tz);
  const services = serviceList(appointment);
  const total = formatCurrency(appointment.quotedTotal);

  const details = `
    <table width="100%" style="border-collapse:collapse;font-size:14px;margin:0 0 8px">
      <tr><td style="padding:5px 0;color:#777;width:130px">When</td><td><strong>${esc(when)}</strong></td></tr>
      <tr><td style="padding:5px 0;color:#777">Reference</td><td>${esc(appointment.reference)}</td></tr>
      <tr><td style="padding:5px 0;color:#777">Services</td><td>${esc(services.join(', '))}</td></tr>
      <tr><td style="padding:5px 0;color:#777">Where</td><td>${
        appointment.locationType === 'mobile'
          ? esc(appointment.address || 'Mobile — at your location')
          : 'At our shop'
      }</td></tr>
      <tr><td style="padding:5px 0;color:#777">Estimated</td><td>${esc(total)}</td></tr>
    </table>`;

  const [customerEmail, customerSms, bizEmail] = await Promise.all([
    sendEmail(
      user.email,
      `Booking confirmed — ${when}`,
      shell(
        'Your booking is confirmed.',
        details +
          `<p style="color:#666;font-size:13px;margin-top:12px">Final pricing is confirmed after
             an in-person inspection. Need to change something? Manage your booking below.</p>`,
        { label: 'Manage booking', url: `${siteUrl}/app/appointments/${appointment.id}` }
      ),
      [
        'Your booking is confirmed.',
        `When: ${when}`,
        `Reference: ${appointment.reference}`,
        `Services: ${services.join(', ')}`,
        `Estimated: ${total}`,
        '',
        `${siteUrl}/app/appointments/${appointment.id}`,
        business.name,
      ].join('\n')
    ),
    sendSms(
      user,
      `${business.name}: booking confirmed for ${when}. Ref ${appointment.reference}. Reply STOP to opt out.`
    ),
    sendEmail(
      businessEmail(),
      `New booking — ${when} — ${appointment.reference}`,
      shell(
        `New booking from ${esc(user.name)}`,
        details +
          `<p style="font-size:14px">${esc(user.name)} · ${esc(user.phone)} · ${esc(user.email)}</p>` +
          (appointment.notes ? `<p style="font-size:14px;color:#555">Notes: ${esc(appointment.notes)}</p>` : '')
      ),
      `New booking — ${when}\n${user.name} ${user.phone}\nRef ${appointment.reference}\n${services.join(', ')}`
    ),
  ]);

  return { customerEmail, customerSms, businessEmail: bizEmail };
}

export async function sendBookingCancelled(
  user: User,
  appointment: Appointment,
  reason: string
): Promise<Status> {
  const when = formatDateTime(appointment.startsAt, getSchedulingConfig().timezone);
  return sendEmail(
    user.email,
    `Booking cancelled — ${appointment.reference}`,
    shell(
      'Your booking has been cancelled.',
      `<p style="margin:0 0 12px">The appointment on <strong>${esc(when)}</strong>
         (${esc(appointment.reference)}) is cancelled.</p>
       ${reason ? `<p style="color:#555;font-size:14px">Reason: ${esc(reason)}</p>` : ''}
       <p style="color:#666;font-size:13px">Book again whenever suits you.</p>`,
      { label: 'Book again', url: `${siteUrl}/app/book` }
    ),
    `Your booking on ${when} (${appointment.reference}) is cancelled.\n${business.name}`
  );
}

export async function sendBookingRescheduled(
  user: User,
  appointment: Appointment,
  previousStart: string
): Promise<Status> {
  const tz = getSchedulingConfig().timezone;
  return sendEmail(
    user.email,
    `Booking moved — ${appointment.reference}`,
    shell(
      'Your booking has moved.',
      `<p style="margin:0 0 10px">Was: <s>${esc(formatDateTime(previousStart, tz))}</s></p>
       <p style="margin:0 0 12px">Now: <strong>${esc(formatDateTime(appointment.startsAt, tz))}</strong></p>`,
      { label: 'View booking', url: `${siteUrl}/app/appointments/${appointment.id}` }
    ),
    `Your booking has moved to ${formatDateTime(appointment.startsAt, tz)}.\n${business.name}`
  );
}

export async function sendAppointmentReminder(
  user: User,
  appointment: Appointment
): Promise<{ email: Status; sms: Status }> {
  const when = formatDateTime(appointment.startsAt, getSchedulingConfig().timezone);
  const [email, sms] = await Promise.all([
    sendEmail(
      user.email,
      `Reminder — your detail is ${when}`,
      shell(
        'See you soon.',
        `<p style="margin:0 0 12px">A quick reminder about your appointment on
           <strong>${esc(when)}</strong> (${esc(appointment.reference)}).</p>`,
        { label: 'View booking', url: `${siteUrl}/app/appointments/${appointment.id}` }
      ),
      `Reminder: your ${business.name} appointment is ${when}. Ref ${appointment.reference}.`
    ),
    sendSms(
      user,
      `${business.name}: reminder — your detail is ${when}. Ref ${appointment.reference}. Reply STOP to opt out.`
    ),
  ]);
  return { email, sms };
}

/**
 * The invoice, once the job is complete. Email with a Pay button, plus a text
 * when the customer has consented. `payUrl` is the appointment page in the
 * app, which shows the invoice and the tip + pay controls.
 */
export async function sendInvoiceNotice(
  user: User,
  appointment: Appointment,
  invoice: { number: string; totalCents: number },
  payUrl: string
): Promise<{ email: Status; sms: Status }> {
  const total = formatCurrency(invoice.totalCents / 100);
  const services = serviceList(appointment);
  const [email, sms] = await Promise.all([
    sendEmail(
      user.email,
      `Your invoice ${invoice.number} — ${total}`,
      shell(
        'Thank you — here is your invoice.',
        `<table width="100%" style="border-collapse:collapse;font-size:14px;margin:0 0 8px">
           <tr><td style="padding:5px 0;color:#777;width:130px">Invoice</td><td>${esc(invoice.number)}</td></tr>
           <tr><td style="padding:5px 0;color:#777">Booking</td><td>${esc(appointment.reference)}</td></tr>
           <tr><td style="padding:5px 0;color:#777">Services</td><td>${esc(services.join(', '))}</td></tr>
           <tr><td style="padding:5px 0;color:#777">Total</td><td><strong>${esc(total)}</strong></td></tr>
         </table>
         <p style="color:#666;font-size:13px;margin-top:12px">Pay securely by card in the app — you can add
           a tip for your technician there too.</p>`,
        { label: 'View & pay', url: payUrl }
      ),
      [
        `Thank you — here is your invoice ${invoice.number}.`,
        `Booking: ${appointment.reference}`,
        `Services: ${services.join(', ')}`,
        `Total: ${total}`,
        '',
        payUrl,
        business.name,
      ].join('\n')
    ),
    sendSms(
      user,
      `${business.name}: your invoice ${invoice.number} for ${total} is ready. Pay here: ${payUrl}. Reply STOP to opt out.`
    ),
  ]);
  return { email, sms };
}

/**
 * The short-notice reminder, about 2½ hours out. Text only: an email this
 * close to the visit is noise, and the in-app bell + push carry it too
 * (see app/api/cron/reminders). SMS still requires the customer's consent.
 */
export async function sendAppointmentSoon(user: User, appointment: Appointment): Promise<Status> {
  const when = formatDateTime(appointment.startsAt, getSchedulingConfig().timezone);
  return sendSms(
    user,
    `${business.name}: see you soon — your detail is at ${when}. Ref ${appointment.reference}. Reply STOP to opt out.`
  );
}

export async function sendJobComplete(user: User, appointment: Appointment): Promise<Status> {
  return sendEmail(
    user.email,
    `All done — ${appointment.reference}`,
    shell(
      'Your vehicle is ready.',
      `<p style="margin:0 0 12px">We have finished the work on ${esc(appointment.reference)}.
         Before-and-after photos are in your account.</p>
       <p style="color:#666;font-size:13px">If anything is not right, reply to this email and we
         will put it straight.</p>`,
      { label: 'See the photos', url: `${siteUrl}/app/appointments/${appointment.id}` }
    ),
    `Your vehicle is ready. ${appointment.reference}\n${siteUrl}/app/appointments/${appointment.id}`
  );
}

/** Used by the AI assistant when it hands a question to a human. */
export async function sendEscalation(
  fromUser: User | null,
  question: string,
  transcript: string
): Promise<Status> {
  return sendEmail(
    businessEmail(),
    `Assistant escalation — a customer needs a human`,
    shell(
      'The assistant could not answer this.',
      `<p style="margin:0 0 12px"><strong>${esc(question)}</strong></p>
       <p style="font-size:14px;color:#555">From: ${
         fromUser ? `${esc(fromUser.name)} · ${esc(fromUser.email)} · ${esc(fromUser.phone)}` : 'Anonymous visitor'
       }</p>
       <pre style="background:#f6f6f6;padding:12px;border-radius:4px;font-size:12px;white-space:pre-wrap">${esc(
         transcript.slice(0, 4000)
       )}</pre>`
    ),
    `Assistant escalation\n\n${question}\n\nFrom: ${fromUser?.email ?? 'anonymous'}\n\n${transcript.slice(0, 4000)}`
  );
}

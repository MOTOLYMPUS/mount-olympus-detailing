// ─────────────────────────────────────────────────────────────────────────────
// Invoicing a booking: "Complete & send invoice", and the customer paying it.
//
// One place that knows the sequence, so the admin button, the customer's Pay
// control and the review gate all agree on what "invoiced" and "paid" mean:
//
//   completeAndInvoice   marks the job complete (points, emails, bell — via
//                        lib/booking), raises ONE invoice from the booking's
//                        services at the quoted price, and tells the customer
//                        (email + SMS with consent + bell/push) with a link to
//                        the appointment page where they pay.
//   checkoutForInvoice   the customer's hosted Stripe Checkout for an invoice,
//                        with an optional tip as a second line item. The
//                        webhook settles both and flips the invoice to paid.
//   appointmentSettled   the review gate: paid invoice, or the ledger shows
//                        the quoted amount collected (cash / Zelle recorded by
//                        a manager counts too).
// ─────────────────────────────────────────────────────────────────────────────

import { getAddOn, getService } from '@/data/pricing';
import { siteUrl } from './business';
import { completeBooking } from './booking';
import { ApiError } from './api';
import { Appointment, Invoice, InvoiceLine, User } from './models';
import { sendInvoiceNotice } from './notify-account';
import { priceFor } from './pricing';
import { notifyUser } from './push';
import { getAppointment } from './repo/appointments';
import {
  createInvoice,
  createPayment,
  listInvoicesForAppointment,
  paidForAppointment,
  setInvoiceStatus,
  setPaymentStatus,
} from './repo/payments';
import { getPriceOverrides } from './repo/pricing';
import { getUser } from './repo/users';
import { CheckoutSession, StripeResult, createCheckoutSession, stripeConfigured } from './stripe';

/** The invoice that currently stands for a booking (latest that is not void). */
export function openInvoiceFor(appointmentId: string): Invoice | null {
  return listInvoicesForAppointment(appointmentId).find((i) => i.status !== 'void') ?? null;
}

/** Has the customer paid for this booking? Drives the review gate. */
export function appointmentSettled(appointment: Appointment): boolean {
  const invoice = openInvoiceFor(appointment.id);
  if (invoice?.status === 'paid') return true;
  const owed = invoice ? invoice.totalCents : Math.round(appointment.quotedTotal * 100);
  return owed > 0 && paidForAppointment(appointment.id) >= owed;
}

/**
 * Line items from the booking's services and add-ons at the catalogue price
 * for its size class (with the owner's overrides), plus a discount line that
 * reconciles to the QUOTED total — so a coupon or membership discount that was
 * priced into the booking shows on the invoice rather than silently vanishing.
 */
export function buildInvoiceLines(appointment: Appointment): { lines: InvoiceLine[]; discountCents: number } {
  const overrides = getPriceOverrides();
  const lines: InvoiceLine[] = [];

  for (const id of appointment.serviceIds) {
    const service = getService(id);
    const price = service ? priceFor(service, appointment.sizeClass, overrides) : undefined;
    if (!service || !price) continue;
    lines.push({ label: service.name, qty: 1, unitCents: Math.round(price.price * 100) });
  }
  for (const id of appointment.addOnIds) {
    const addOn = getAddOn(id);
    const price = addOn ? priceFor(addOn, appointment.sizeClass, overrides) : undefined;
    if (!addOn || !price) continue;
    lines.push({ label: addOn.name, qty: 1, unitCents: Math.round(price.price * 100) });
  }

  // A booking whose services no longer resolve (renamed catalogue) still gets
  // billed for what was quoted.
  if (lines.length === 0) {
    lines.push({ label: 'Detailing services', qty: 1, unitCents: Math.round(appointment.quotedTotal * 100) });
  }

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitCents, 0);
  const quoted = Math.round(appointment.quotedTotal * 100);
  return { lines, discountCents: Math.max(0, subtotal - quoted) };
}

export async function completeAndInvoice(
  appointmentId: string,
  actor: User
): Promise<{ appointment: Appointment; invoice: Invoice; created: boolean }> {
  const existing = getAppointment(appointmentId);
  if (!existing) throw new ApiError('Booking not found.', 404);
  if (existing.status === 'cancelled') throw new ApiError('A cancelled booking cannot be invoiced.', 409);

  // completeBooking is idempotent (returns early if already completed) and
  // owns the side effects: loyalty points, tier coupons, emails, bell/push.
  const appointment = await completeBooking(appointmentId, actor);

  const current = openInvoiceFor(appointment.id);
  if (current) return { appointment, invoice: current, created: false };

  const { lines, discountCents } = buildInvoiceLines(appointment);
  const invoice = createInvoice({
    userId: appointment.customerId,
    appointmentId: appointment.id,
    lines,
    discountCents,
    status: 'sent',
  });

  const customer = getUser(appointment.customerId);
  if (customer) {
    const payUrl = `${siteUrl}/app/appointments/${appointment.id}`;
    sendInvoiceNotice(customer, appointment, invoice, payUrl).catch((e) =>
      console.error('[invoicing] invoice notice failed', e)
    );
    notifyUser(customer.id, {
      kind: 'invoice.sent',
      title: `Invoice ${invoice.number} — $${(invoice.totalCents / 100).toFixed(2)}`,
      body: 'Thank you! Tap to view and pay.',
      url: `/app/appointments/${appointment.id}`,
    }).catch((e) => console.error('[invoicing] notify failed', e));
  }

  return { appointment, invoice, created: true };
}

/**
 * Hosted Checkout for an invoice, optionally with a tip. Pending payment rows
 * are written FIRST so the webhook always has something to settle even if the
 * customer never returns to the app.
 */
export async function checkoutForInvoice(
  invoice: Invoice,
  customer: User,
  tipCents: number
): Promise<StripeResult<{ url: string; paymentId: string }>> {
  if (!stripeConfigured()) {
    return { ok: false, reason: 'not-configured', message: 'Card payments are not set up yet.' };
  }
  if (invoice.status === 'paid') return { ok: false, reason: 'error', message: 'This invoice is already paid.' };
  if (invoice.status === 'void') return { ok: false, reason: 'error', message: 'This invoice was voided.' };
  if (invoice.totalCents <= 0) return { ok: false, reason: 'error', message: 'Nothing to pay on this invoice.' };

  const tip = Math.max(0, Math.round(tipCents));

  const payment = createPayment({
    appointmentId: invoice.appointmentId,
    userId: customer.id,
    kind: 'balance',
    amountCents: invoice.totalCents,
    status: 'pending',
    provider: 'stripe',
    methodLabel: 'Card',
  });
  const tipPayment =
    tip > 0
      ? createPayment({
          appointmentId: invoice.appointmentId,
          userId: customer.id,
          kind: 'tip',
          amountCents: tip,
          status: 'pending',
          provider: 'stripe',
          methodLabel: 'Card',
        })
      : null;

  const back = invoice.appointmentId ? `/app/appointments/${invoice.appointmentId}` : '/app/payments';
  const session: StripeResult<CheckoutSession> = await createCheckoutSession({
    amountCents: invoice.totalCents,
    kind: 'balance',
    appointmentId: invoice.appointmentId,
    userId: customer.id,
    invoiceId: invoice.id,
    customerEmail: customer.email,
    label: `Invoice ${invoice.number}`,
    tipCents: tip,
    tipPaymentId: tipPayment?.id ?? null,
    successUrl: `${siteUrl}${back}?paid=1`,
    cancelUrl: `${siteUrl}${back}?cancelled=1`,
  });

  if (!session.ok) return session;
  if (!session.data.url) return { ok: false, reason: 'error', message: 'The payment provider returned no link.' };

  setPaymentStatus(payment.id, 'pending', { providerRef: session.data.id });
  if (tipPayment) setPaymentStatus(tipPayment.id, 'pending', { providerRef: `${session.data.id}:tip` });
  if (invoice.status === 'draft') setInvoiceStatus(invoice.id, 'sent');

  return { ok: true, data: { url: session.data.url, paymentId: payment.id } };
}

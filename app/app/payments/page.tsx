// ─────────────────────────────────────────────────────────────────────────────
// /app/payments — payment history, invoices, and anything still owed.
//
// The balance due is computed from the LEDGER (paidForAppointment) rather than
// from a stored "paid" flag on the appointment, so a refund recorded after the
// fact reopens the balance automatically instead of leaving a stale zero.
//
// When Stripe is unconfigured the page renders an honest "settle up on the day"
// state. See components/app/PayActions.tsx for why a disabled button would be
// worse than none.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import PayActions from '@/components/app/PayActions';
import { Alert, Card, CardTitle, EmptyState, Field, PageHeader, StatusBadge } from '@/components/ui';
import { business } from '@/lib/business';
import { requirePage } from '@/lib/guards';
import { formatCurrency } from '@/lib/pricing';
import { listAppointments } from '@/lib/repo/appointments';
import { listInvoices, listPayments, paidForAppointment } from '@/lib/repo/payments';
import { stripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Payments',
  robots: { index: false, follow: false },
};

const money = (cents: number) => formatCurrency(cents / 100);

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function PaymentsPage() {
  const user = await requirePage('/app/payments');

  const payments = listPayments({ userId: user.id, limit: 100 });
  const invoices = listInvoices({ userId: user.id, limit: 50 });
  const canPay = stripeConfigured();

  // Outstanding balance per booking: quoted total minus what the ledger says
  // has actually been collected against it.
  const outstanding = listAppointments({ customerId: user.id, direction: 'all', limit: 100 })
    .filter((a) => a.status !== 'cancelled')
    .map((a) => {
      const quotedCents = Math.round(a.quotedTotal * 100);
      return {
        id: a.id,
        reference: a.reference,
        startsAt: a.startsAt,
        status: a.status,
        quotedCents,
        paidCents: paidForAppointment(a.id),
        balanceCents: Math.max(0, quotedCents - paidForAppointment(a.id)),
      };
    })
    .filter((a) => a.balanceCents > 0);

  const totalDue = outstanding.reduce((sum, a) => sum + a.balanceCents, 0);

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Payments"
        description="What you have paid, what is outstanding, and every invoice we have raised."
      />

      {!canPay && (
        <div className="mb-6">
          <Alert tone="info" title="Pay on the day">
            We are not taking card payments online yet. Settle up with your technician when the
            work is done — cash, Zelle, or card in person — or call {business.phone} to arrange
            payment.
          </Alert>
        </div>
      )}

      {/* ── Balance due ─────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardTitle>Balance due</CardTitle>
        {totalDue === 0 ? (
          <p className="py-2 text-sm text-muted">Nothing outstanding. You are all square.</p>
        ) : (
          <>
            <p className="font-display text-3xl font-bold tracking-tightest text-white">
              {money(totalDue)}
            </p>
            <ul className="mt-4 space-y-3">
              {outstanding.map((a) => (
                <li key={a.id} className="rounded-sm border border-white/10 p-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-[12px] text-muted">{a.reference}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <dl className="mt-2">
                    <Field label="Booked">{whenLabel(a.startsAt)}</Field>
                    <Field label="Quoted">{money(a.quotedCents)}</Field>
                    <Field label="Paid">{money(a.paidCents)}</Field>
                    <Field label="Outstanding">
                      <strong>{money(a.balanceCents)}</strong>
                    </Field>
                  </dl>
                  {canPay && (
                    <div className="mt-3">
                      <PayActions balanceCents={a.balanceCents} appointmentId={a.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Tips are worth offering even with nothing owed. */}
        {canPay && totalDue === 0 && (
          <div className="mt-4">
            <PayActions balanceCents={0} appointmentId={null} />
          </div>
        )}
      </Card>

      {/* ── Invoices ────────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardTitle>Invoices</CardTitle>
        {invoices.length === 0 ? (
          <p className="py-2 text-sm text-muted">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[12px] text-white">{inv.number}</p>
                  <p className="text-[12px] text-subtle">
                    {whenLabel(inv.issuedAt ?? inv.createdAt)} · {inv.lines.length} line
                    {inv.lines.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-white">{money(inv.totalCents)}</span>
                  <StatusBadge status={inv.status} />
                  {inv.status === 'sent' && inv.appointmentId && (
                    <Link
                      href={`/app/appointments/${inv.appointmentId}`}
                      className="rounded-sm bg-apex px-3 py-1.5 text-[13px] font-medium text-white hover:bg-apex/90"
                    >
                      View &amp; pay
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── History ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Payment history</CardTitle>
        {payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Once you have had a service completed, every payment and refund shows up here."
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm capitalize text-white">
                    {p.kind}
                    {p.methodLabel ? ` · ${p.methodLabel}` : ''}
                  </p>
                  <p className="text-[12px] text-subtle">
                    {whenLabel(p.createdAt)} · {p.provider}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      p.kind === 'refund'
                        ? 'font-mono text-sm text-amber-400'
                        : 'font-mono text-sm text-white'
                    }
                  >
                    {p.kind === 'refund' ? '−' : ''}
                    {money(p.amountCents)}
                  </span>
                  <StatusBadge status={p.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

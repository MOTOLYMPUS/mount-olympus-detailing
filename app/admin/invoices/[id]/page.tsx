// ─────────────────────────────────────────────────────────────────────────────
// /admin/invoices/[id] — one invoice: its lines, its customer, and the actions
// to get paid.
//
// The fee hint (card vs bank) is shown ONLY when there is a balance to charge.
// It reads from lib/finance.ts so the numbers here and on the finance hub can
// never disagree.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRolePage } from '@/lib/guards';
import { getInvoice } from '@/lib/repo/payments';
import { getUser } from '@/lib/repo/users';
import { stripeConfigured } from '@/lib/stripe';
import { compareFees } from '@/lib/finance';
import { formatMoney } from '@/lib/pricing';
import { PageHeader, Card, Field, StatusBadge, LinkButton } from '@/components/ui';
import InvoiceActions from '@/components/admin/InvoiceActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRolePage('admin');

  const invoice = getInvoice((await params).id);
  if (!invoice) notFound();

  const customer = getUser(invoice.userId);
  const fees = compareFees(invoice.totalCents);
  const showFeeHint = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.totalCents > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Invoice ${invoice.number}`}
        title={customer?.name ?? 'Customer'}
        description={customer?.email}
        action={
          <LinkButton href="/admin/invoices" variant="ghost" size="sm">
            All invoices
          </LinkButton>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Lines */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="eyebrow">Line items</h2>
            <StatusBadge status={invoice.status} />
          </div>

          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/5">
              {invoice.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2.5 text-white">{l.label}</td>
                  <td className="py-2.5 text-right font-mono text-muted">
                    {l.qty} × {formatMoney(l.unitCents)}
                  </td>
                  <td className="py-2.5 pl-4 text-right font-mono text-white">
                    {formatMoney((l.qty * l.unitCents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-4 border-t border-white/10 pt-4">
            <Field label="Subtotal">{formatMoney(invoice.subtotalCents)}</Field>
            {invoice.discountCents > 0 && (
              <Field label="Discount">−{formatMoney(invoice.discountCents)}</Field>
            )}
            {invoice.taxCents > 0 && <Field label="Tax">{formatMoney(invoice.taxCents)}</Field>}
            {invoice.tipCents > 0 && <Field label="Tip">{formatMoney(invoice.tipCents)}</Field>}
            <Field label="Total">
              <span className="text-base font-semibold text-white">
                {formatMoney(invoice.totalCents)}
              </span>
            </Field>
          </dl>
        </Card>

        {/* Actions + fee guidance */}
        <div className="space-y-6">
          <Card>
            <h2 className="eyebrow mb-4">Get paid</h2>
            <InvoiceActions invoice={invoice} stripeConfigured={stripeConfigured()} />
          </Card>

          {showFeeHint && (
            <Card>
              <h2 className="eyebrow mb-1">Stripe fee &amp; your payout</h2>
              {/* Owner-facing only. The client is charged the invoice total; the
                  fee comes out of what Stripe settles to you. It is never added
                  to the customer's price. */}
              <p className="mb-3 text-[12px] leading-relaxed text-subtle">
                The client pays {formatMoney(invoice.totalCents)}. Stripe&rsquo;s fee is deducted
                from your payout — it is not added to their bill.
              </p>
              <dl>
                <Field label="If paid by card (2.9% + 30¢)">
                  <span className="text-subtle">−{formatMoney(fees.cardFeeCents)}</span> →{' '}
                  <span className="font-semibold text-white">
                    {formatMoney(invoice.totalCents - fees.cardFeeCents)}
                  </span>
                </Field>
                <Field label="If paid by bank / ACH (0.8%, max $5)">
                  <span className="text-subtle">−{formatMoney(fees.achFeeCents)}</span> →{' '}
                  <span className="font-semibold text-white">
                    {formatMoney(invoice.totalCents - fees.achFeeCents)}
                  </span>
                </Field>
              </dl>
              {fees.achSavesCents > 0 && (
                <p className="mt-3 text-[12px] leading-relaxed text-emerald-400">
                  Bank transfer keeps {formatMoney(fees.achSavesCents)} more of this invoice in your
                  pocket. Worth nudging the client to ACH on larger jobs.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

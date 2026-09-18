// ─────────────────────────────────────────────────────────────────────────────
// /admin/finances — the money hub: revenue, expenses, net, outstanding, and the
// two places to act (invoices, expenses).
//
// requireRolePage('admin'). Everything here reads from lib/finance.ts, which
// composes the payments and expenses repos, so this page never computes a total
// of its own — it displays one. Year-to-date by default; ?year= for a prior
// year so it lines up with a filed return.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { requireRolePage } from '@/lib/guards';
import { financeOverview, compareFees, achBreakEvenCents } from '@/lib/finance';
import { stripeConfigured } from '@/lib/stripe';
import { formatMoney } from '@/lib/pricing';
import { PageHeader, Card, StatTile, LinkButton, Alert } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Finances',
  robots: { index: false, follow: false },
};

export default async function FinancesPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string }>;
}) {
  await requireRolePage('admin');

  const thisYear = new Date().getFullYear();
  const parsed = Number((await searchParams)?.year);
  const year = parsed >= 2015 && parsed <= thisYear ? parsed : thisYear;

  // Full-day ISO bounds: Jan 1 00:00 through Jan 1 next year (exclusive upper
  // bound is how revenueFromPayments is written).
  const fromIso = new Date(Date.UTC(year, 0, 1)).toISOString();
  const toIso = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const o = financeOverview(fromIso, toIso);
  const netPositive = o.netCents >= 0;

  // A representative large-ticket comparison for the fee guidance.
  const sample = compareFees(80000); // $800 job

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${year}`}
        title="Finances"
        description="Revenue collected, expenses recorded, and what is still owed. Administrators only."
        action={
          // Expenses has its own button on the Business tab (and a "Log
          // expense" on Reports), so it is not duplicated here.
          <LinkButton href="/admin/invoices" size="sm">
            Invoices
          </LinkButton>
        }
      />

      {!stripeConfigured() && (
        <Alert tone="warning" title="Card payments aren’t switched on yet">
          You can still invoice and record cash/Zelle payments. Add your Stripe keys (see{' '}
          <span className="font-mono">.env.example</span>) to charge cards and bank transfers from
          an invoice.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={`${year} revenue`} value={formatMoney(o.revenueCents)} />
        <StatTile label="Expenses" value={formatMoney(o.expenseCents)} />
        <StatTile
          label="Net"
          value={formatMoney(o.netCents)}
          sub={netPositive ? 'profit' : 'loss'}
        />
        <StatTile
          label="Outstanding"
          value={formatMoney(o.outstandingCents)}
          sub={`${o.outstandingCount} unpaid`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="eyebrow mb-3">Lowest-fee payments</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            Card is fast; bank transfer (ACH) is cheapest. Stripe charges{' '}
            <span className="text-white">2.9% + 30¢</span> per card, versus{' '}
            <span className="text-white">0.8% capped at $5</span> for ACH. On an $800 job that is{' '}
            {formatMoney(sample.cardFeeCents)} vs{' '}
            {formatMoney(sample.achFeeCents)} — a saving of{' '}
            <span className="text-emerald-400">{formatMoney(sample.achSavesCents)}</span>.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Above about {formatMoney(achBreakEvenCents())}, ACH wins. Every invoice shows
            the exact fee both ways so you can nudge big clients to bank transfer.
          </p>
        </Card>

        <Card>
          <h2 className="eyebrow mb-3">Tax records</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            Expenses are categorised to IRS Schedule C lines and exportable as a CSV per year, ready
            for a return or your accountant. {formatMoney(o.deductibleCents)} of {year}{' '}
            spend is marked deductible.
          </p>
          <LinkButton href="/admin/expenses" variant="secondary" size="sm" className="mt-4">
            Open expense ledger
          </LinkButton>
        </Card>
      </div>
    </div>
  );
}

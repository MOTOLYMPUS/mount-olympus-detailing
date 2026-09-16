// ─────────────────────────────────────────────────────────────────────────────
// /admin/expenses — the owner's expense ledger and tax export.
//
// requireRolePage('admin') — NOT manager. This is tax data; the /admin layout
// floor is 'manager', so this page raises the bar itself, exactly the way
// /admin/settings and /admin/employees do.
//
// Server component: it reads the window's expenses and summary directly and
// hands the list to one client component for entry/editing. The year selector
// is plain links (?year=) so a bookmarked year keeps working and there is no
// client date-picker to ship.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { requireRolePage } from '@/lib/guards';
import { listExpenses, expenseSummary } from '@/lib/repo/expenses';
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from '@/lib/models';
import { formatMoney } from '@/lib/pricing';
import { PageHeader, Card, StatTile, LinkButton, buttonClass } from '@/components/ui';
import ExpenseManager from '@/components/admin/ExpenseManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Expenses',
  robots: { index: false, follow: false },
};

function yearBounds(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string }>;
}) {
  await requireRolePage('admin');

  const thisYear = new Date().getFullYear();
  const parsed = Number((await searchParams)?.year);
  const year = parsed >= 2015 && parsed <= thisYear + 1 ? parsed : thisYear;
  const { from, to } = yearBounds(year);

  const expenses = listExpenses({ from, to, limit: 1000 });
  const summary = expenseSummary(from, to);

  // Offer the current year plus the previous four — enough to file and amend.
  const years = Array.from({ length: 5 }, (_, i) => thisYear - i);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Bookkeeping"
        title="Expenses"
        description="Track what you spend to run the business, categorised for taxes. Only administrators can see this."
        action={
          <a
            href={`/api/expenses/export?from=${from}&to=${to}`}
            className={buttonClass('secondary', 'sm')}
          >
            Export {year} CSV
          </a>
        }
      />

      {/* Year selector */}
      <nav aria-label="Tax year" className="flex flex-wrap gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={y === thisYear ? '/admin/expenses' : `/admin/expenses?year=${y}`}
            aria-current={y === year ? 'page' : undefined}
            className={clsx(
              'rounded-sm border px-3.5 py-1.5 font-mono text-[12px] transition-colors',
              y === year
                ? 'border-apex bg-apex/10 text-white'
                : 'border-white/15 text-muted hover:border-white/40 hover:text-white'
            )}
          >
            {y}
          </Link>
        ))}
      </nav>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={`${year} total spend`} value={formatMoney(summary.totalCents)} />
        <StatTile
          label="Deductible"
          value={formatMoney(summary.deductibleCents)}
        />
        <StatTile label="Entries" value={String(summary.count)} />
      </div>

      {/* Category breakdown */}
      {summary.byCategory.length > 0 && (
        <Card>
          <h2 className="eyebrow mb-4">By category</h2>
          <ul className="space-y-2.5">
            {summary.byCategory.map((c) => {
              const pct = summary.totalCents ? (c.totalCents / summary.totalCents) * 100 : 0;
              return (
                <li key={c.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-white">{expenseCategoryLabel(c.category)}</span>
                    <span className="font-mono text-muted">
                      {formatMoney(c.totalCents)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-apex" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Entry + ledger */}
      <section aria-labelledby="ledger-heading">
        <h2 id="ledger-heading" className="eyebrow mb-4">
          {year} ledger
        </h2>
        <ExpenseManager initial={expenses} categories={EXPENSE_CATEGORIES} />
      </section>

      <p className="text-[12px] leading-relaxed text-subtle">
        Categories map to common IRS Schedule C lines, shown when you pick one and included in the
        CSV export. This is a record-keeping tool, not tax advice — confirm treatment with your
        accountant.
      </p>
    </div>
  );
}

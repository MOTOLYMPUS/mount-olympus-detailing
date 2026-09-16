// ─────────────────────────────────────────────────────────────────────────────
// GET /api/expenses/export?from=YYYY-MM-DD&to=YYYY-MM-DD — CSV for taxes.
//
// Admin+ only, like every expense route. Streams a spreadsheet-ready file with
// the Schedule C line per row, so it drops straight into a return or a
// bookkeeper's import. Dollars here, not cents — this file is read by humans and
// accounting software, both of which expect 123.45.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from '@/lib/models';
import { listExpenses } from '@/lib/repo/expenses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const scheduleCFor = (id: string) =>
  EXPENSE_CATEGORIES.find((c) => c.id === id)?.scheduleC ?? '';

/** RFC-4180 quoting: wrap in quotes and double any internal quote. */
function csvCell(value: string): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = withAuth('admin', async ({ query }) => {
  const from = query.get('from') ?? '';
  const to = query.get('to') ?? '';

  const expenses = listExpenses({
    from: DATE_RE.test(from) ? from : undefined,
    to: DATE_RE.test(to) ? to : undefined,
    limit: 100_000,
  });

  const header = ['Date', 'Category', 'Schedule C line', 'Vendor', 'Note', 'Amount', 'Deductible'];
  const rows = expenses.map((e) => [
    e.spentOn,
    expenseCategoryLabel(e.category),
    scheduleCFor(e.category),
    e.vendor,
    e.note,
    (e.amountCents / 100).toFixed(2),
    e.deductible ? 'Yes' : 'No',
  ]);

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');

  const label = DATE_RE.test(from) ? from.slice(0, 4) : 'all';
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mount-olympus-expenses-${label}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

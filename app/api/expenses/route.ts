// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/expenses  — list expenses in a window (admin+ only)
// POST /api/expenses  — record one (admin+ only)
//
// Gated at 'admin', NOT 'manager'. Expenses are the owner's tax data; a manager
// who runs the schedule has no reason to see the business's cost base. This is
// the tightest scope in the API and it is deliberate.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, int, ok, str, withAuth } from '@/lib/api';
import { EXPENSE_CATEGORY_IDS, ExpenseCategory } from '@/lib/models';
import { createExpense, listExpenses } from '@/lib/repo/expenses';
import { getAppointment } from '@/lib/repo/appointments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_CENTS = 1;
const MAX_CENTS = 100_000_000; // $1,000,000 — a sane ceiling for a data-entry slip.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validCategory(v: unknown): ExpenseCategory | null {
  const c = str(v, 40) as ExpenseCategory;
  return (EXPENSE_CATEGORY_IDS as string[]).includes(c) ? c : null;
}

export const GET = withAuth('admin', async ({ query }) => {
  const from = str(query.get('from'), 10);
  const to = str(query.get('to'), 10);
  const category = validCategory(query.get('category')) ?? undefined;

  return ok({
    expenses: listExpenses({
      from: DATE_RE.test(from) ? from : undefined,
      to: DATE_RE.test(to) ? to : undefined,
      category,
      limit: Math.min(1000, Number(query.get('limit')) || 500),
    }),
  });
});

export const POST = withAuth(
  'admin',
  async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;

    const spentOn = str(b.spentOn, 10);
    if (!DATE_RE.test(spentOn)) {
      return fail('Enter a valid date.', 400, { spentOn: 'Use YYYY-MM-DD.' });
    }
    // A far-future date is almost always a typo; a receipt cannot be for
    // tomorrow. Allow today in any timezone with a one-day grace.
    const maxDate = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    if (spentOn > maxDate) {
      return fail('That date is in the future.', 400, { spentOn: 'Cannot be a future date.' });
    }

    const category = validCategory(b.category);
    if (!category) return fail('Choose a category.', 400, { category: 'Required.' });

    const amountCents = int(b.amountCents, 0);
    if (amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return fail('Enter an amount between $0.01 and $1,000,000.', 400, {
        amountCents: 'Invalid amount.',
      });
    }

    // Optional link to the job the money was spent on. Must be a real booking.
    const appointmentId = str(b.appointmentId, 60) || null;
    if (appointmentId && !getAppointment(appointmentId)) {
      return fail('That booking no longer exists.', 400, { appointmentId: 'Unknown booking.' });
    }

    // A receipt must be one of OUR uploads in the receipts scope.
    const receiptKey = str(b.receiptKey, 200) || null;
    if (receiptKey && !/^receipts\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/.test(receiptKey)) {
      return fail('That receipt has not been uploaded yet.', 400, { receiptKey: 'Invalid receipt.' });
    }

    const expense = createExpense({
      spentOn,
      category,
      amountCents,
      vendor: str(b.vendor, 120),
      note: str(b.note, 500),
      deductible: b.deductible !== false, // default deductible unless told otherwise
      receiptKey,
      appointmentId,
      createdBy: user.id,
    });

    return ok({ expense }, { status: 201 });
  },
  { limit: 'api' }
);

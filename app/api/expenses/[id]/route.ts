// ─────────────────────────────────────────────────────────────────────────────
// PATCH  /api/expenses/[id]  — edit one (admin+)
// DELETE /api/expenses/[id]  — remove one (admin+)
//
// Same 'admin' floor as the collection route. A deleted expense is gone, not
// soft-hidden — this is the owner's own ledger, and an owner correcting a
// data-entry mistake should not leave tombstones in their tax export. The
// trip logged with it and its event photos go with it.
//
// PATCH also takes `mileage` (object = set, null = remove) and `photoKeys`
// (replaces the set). Any edit carries the date and description onto the
// linked trip so the mileage log never disagrees with the ledger.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, int, ok, str, withAuth } from '@/lib/api';
import { EXPENSE_CATEGORY_IDS, ExpenseCategory } from '@/lib/models';
import { deleteExpense, getExpense, setExpensePhotos, updateExpense } from '@/lib/repo/expenses';
import { getTaxProfile } from '@/lib/repo/settings';
import { parseEventMileage, parsePhotoKeys } from '@/lib/validation-mileage';
import { syncExpenseTrip } from '@/lib/mileage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PATCH = withAuth('admin', async ({ params, body, user }) => {
  const current = getExpense(params.id);
  if (!current) return fail('Expense not found.', 404);

  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Parameters<typeof updateExpense>[1] = {};

  if (b.spentOn !== undefined) {
    const spentOn = str(b.spentOn, 10);
    if (!DATE_RE.test(spentOn)) return fail('Invalid date.', 400, { spentOn: 'Use YYYY-MM-DD.' });
    patch.spentOn = spentOn;
  }
  if (b.category !== undefined) {
    const c = str(b.category, 40) as ExpenseCategory;
    if (!(EXPENSE_CATEGORY_IDS as string[]).includes(c)) return fail('Unknown category.', 400);
    patch.category = c;
  }
  if (b.amountCents !== undefined) {
    const amount = int(b.amountCents, 0);
    if (amount < 1 || amount > 100_000_000) return fail('Invalid amount.', 400);
    patch.amountCents = amount;
  }
  if (b.vendor !== undefined) patch.vendor = str(b.vendor, 120);
  if (b.note !== undefined) patch.note = str(b.note, 500);
  if (b.deductible !== undefined) patch.deductible = b.deductible === true;
  if (b.receiptKey !== undefined) patch.receiptKey = str(b.receiptKey, 200) || null;

  const mileage = parseEventMileage(b.mileage, getTaxProfile().baseAddress);
  const photoKeys = parsePhotoKeys(b.photoKeys);

  const updated = Object.keys(patch).length ? updateExpense(params.id, patch)! : current;
  if (photoKeys) setExpensePhotos(updated.id, photoKeys);
  syncExpenseTrip(updated, mileage, user.id);

  return ok({ expense: getExpense(updated.id) });
});

export const DELETE = withAuth('admin', async ({ params }) => {
  if (!deleteExpense(params.id)) return fail('Expense not found.', 404);
  return ok({ deleted: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finance helpers — processing-fee math and the owner's money overview.
//
// The fee schedule is the one Stripe publishes; it lives here as data, not
// scattered through the UI, so a rate change is a one-line edit. These figures
// are ESTIMATES for guidance (nudging a big invoice toward ACH). Stripe's own
// settlement is always the source of truth for what was actually charged.
// ─────────────────────────────────────────────────────────────────────────────

import { revenueFromPayments } from './repo/payments';
import { listInvoices } from './repo/payments';
import { expenseSummary } from './repo/expenses';

export type PayMethod = 'card' | 'ach';

/** Stripe US standard pricing. Update here if your negotiated rates differ. */
export const FEE_SCHEDULE = {
  card: { percent: 0.029, fixedCents: 30, cap: null as number | null },
  // ACH Direct Debit: 0.8%, capped at $5.00 — the whole reason to offer it.
  ach: { percent: 0.008, fixedCents: 0, cap: 500 },
};

/** Estimated processing fee in cents for one charge on the given method. */
export function estimateFeeCents(amountCents: number, method: PayMethod): number {
  const s = FEE_SCHEDULE[method];
  let fee = Math.round(amountCents * s.percent) + s.fixedCents;
  if (s.cap !== null) fee = Math.min(fee, s.cap);
  return fee;
}

export interface FeeComparison {
  amountCents: number;
  cardFeeCents: number;
  achFeeCents: number;
  /** Positive = ACH is cheaper by this many cents. */
  achSavesCents: number;
  cheapest: PayMethod;
}

export function compareFees(amountCents: number): FeeComparison {
  const cardFeeCents = estimateFeeCents(amountCents, 'card');
  const achFeeCents = estimateFeeCents(amountCents, 'ach');
  return {
    amountCents,
    cardFeeCents,
    achFeeCents,
    achSavesCents: cardFeeCents - achFeeCents,
    cheapest: achFeeCents <= cardFeeCents ? 'ach' : 'card',
  };
}

/** The dollar figure above which ACH beats card — used to explain the nudge. */
export function achBreakEvenCents(): number {
  // Solve 0.029x + 30 = min(0.008x, 500). Below the cap this is where the
  // percentage difference overtakes the 30¢ card fixed fee.
  // 0.021x = 30  →  x ≈ 1428¢. Round to a clean $15 for messaging.
  return 1500;
}

export interface FinanceOverview {
  from: string;
  to: string;
  revenueCents: number;
  expenseCents: number;
  deductibleCents: number;
  netCents: number;
  outstandingCents: number;
  outstandingCount: number;
}

/**
 * One window's money picture: collected revenue minus recorded expenses, plus
 * what is still owed on unpaid invoices. `from`/`to` are ISO datetimes for
 * payments and ISO dates for expenses — callers pass a full-day range.
 */
export function financeOverview(fromIso: string, toIso: string): FinanceOverview {
  const revenueCents = revenueFromPayments(fromIso, toIso);
  const exp = expenseSummary(fromIso.slice(0, 10), toIso.slice(0, 10));

  // Outstanding = issued but not yet paid or voided. Draft invoices are not yet
  // a claim on anyone, so they are excluded.
  const invoices = listInvoices({ limit: 500 });
  let outstandingCents = 0;
  let outstandingCount = 0;
  for (const inv of invoices) {
    if (inv.status === 'sent') {
      outstandingCents += inv.totalCents;
      outstandingCount += 1;
    }
  }

  return {
    from: fromIso,
    to: toIso,
    revenueCents,
    expenseCents: exp.totalCents,
    deductibleCents: exp.deductibleCents,
    netCents: revenueCents - exp.totalCents,
    outstandingCents,
    outstandingCount,
  };
}

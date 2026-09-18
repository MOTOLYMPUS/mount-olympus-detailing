'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Expense ledger (admin only).
//
// Entry is <ExpenseLogger> — the same form Reports uses, so there is exactly
// one way to log a spend. This file is the table underneath it: the year's
// entries with job, receipt and delete.
//
// After a delete it calls router.refresh(): the list, the category totals and
// the finance hub are all server-rendered from the same table, so a refresh
// keeps every one of them in agreement without a second source of truth.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ExpenseLogger, { JobOption } from '@/components/admin/ExpenseLogger';
import { Expense, ExpenseCategoryDef, expenseCategoryLabel } from '@/lib/models';
import { formatMoney } from '@/lib/pricing';

export default function ExpenseManager({
  initial,
  categories,
  jobs,
  /** appointment id → reference, for the Job column. */
  jobRefs,
}: {
  initial: Expense[];
  categories: ExpenseCategoryDef[];
  jobs: JobOption[];
  jobRefs: Record<string, string>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <ExpenseLogger categories={categories} jobs={jobs} />

      {initial.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No expenses recorded for this period yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                <th className="px-3 py-2.5 font-normal">Date</th>
                <th className="px-3 py-2.5 font-normal">Category</th>
                <th className="px-3 py-2.5 font-normal">Vendor</th>
                <th className="px-3 py-2.5 font-normal">Job</th>
                <th className="px-3 py-2.5 text-right font-normal">Amount</th>
                <th className="px-3 py-2.5 text-center font-normal">Deduct.</th>
                <th className="px-3 py-2.5 text-center font-normal">Receipt</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {initial.map((e) => (
                <tr key={e.id} className="text-white/90">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px]">{e.spentOn}</td>
                  <td className="px-3 py-2.5">
                    {expenseCategoryLabel(e.category)}
                    {e.note && <span className="block text-[12px] text-subtle">{e.note}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{e.vendor || '—'}</td>
                  <td className="px-3 py-2.5">
                    {e.appointmentId ? (
                      <Link
                        href={`/admin/appointments/${e.appointmentId}`}
                        className="font-mono text-[12px] text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                      >
                        {jobRefs[e.appointmentId] ?? 'Job'}
                      </Link>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{formatMoney(e.amountCents)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {e.deductible ? (
                      <span className="text-emerald-400" aria-label="Deductible">
                        ✓
                      </span>
                    ) : (
                      <span className="text-subtle" aria-label="Not deductible">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {e.receiptKey ? (
                      <a
                        href={`/api/files/${e.receiptKey}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[12px] text-flare hover:text-white"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      disabled={busyId === e.id}
                      className="text-[12px] text-subtle transition-colors hover:text-apex disabled:opacity-50"
                    >
                      {busyId === e.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

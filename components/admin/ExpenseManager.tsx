'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Expense entry + ledger (admin only).
//
// Amounts are typed in DOLLARS and converted to integer cents on submit — the
// column, the totals, and the tax export are all cents, so the conversion
// happens once, here, at the boundary. Everything downstream stays integer.
//
// After any write it calls router.refresh(): the list, the category totals, and
// the finance hub are all server-rendered from the same table, so a refresh is
// what keeps every one of them in agreement without a second source of truth.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, buttonClass } from '@/components/ui';
import { InputField, SelectField, TextAreaField } from '@/components/Field';
import { Expense, ExpenseCategoryDef, expenseCategoryLabel } from '@/lib/models';
import { formatMoney } from '@/lib/pricing';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export default function ExpenseManager({
  initial,
  categories,
}: {
  initial: Expense[];
  categories: ExpenseCategoryDef[];
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [spentOn, setSpentOn] = useState(todayIso());
  const [category, setCategory] = useState('supplies');
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');
  const [deductible, setDeductible] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setBanner('');
    setErrors({});
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spentOn,
          category,
          amountCents: Math.round(Number(amount) * 100),
          vendor,
          note,
          deductible,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrors(data.errors ?? {});
        if (!Object.keys(data.errors ?? {}).length) {
          setBanner(data.error ?? 'That did not save. Please try again.');
        }
        return;
      }
      // Reset the money fields but keep date + category — most people enter a
      // run of similar receipts in one sitting.
      setAmount('');
      setVendor('');
      setNote('');
      router.refresh();
    } catch {
      setBanner('We could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

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

  const canSubmit = spentOn && category && Number(amount) > 0 && !pending;

  return (
    <div className="space-y-5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass('primary', 'sm')}>
          + Add expense
        </button>
      ) : (
        <div className="space-y-4 rounded-sm border border-white/10 bg-white/[0.02] p-4">
          {banner && <Alert tone="danger">{banner}</Alert>}

          <div className="grid gap-3 sm:grid-cols-2">
            <InputField
              label="Date"
              type="date"
              value={spentOn}
              onChange={setSpentOn}
              required
              max={todayIso()}
              error={errors.spentOn}
            />
            <InputField
              label="Amount (USD)"
              value={amount}
              onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              required
              error={errors.amountCents}
            />
            <SelectField
              label="Category"
              value={category}
              onChange={setCategory}
              required
              error={errors.category}
              options={categories.map((c) => ({ value: c.id, label: c.label }))}
              hint={categories.find((c) => c.id === category)?.scheduleC}
            />
            <InputField
              label="Vendor / payee"
              value={vendor}
              onChange={setVendor}
              placeholder="e.g. Chemical Guys"
            />
          </div>

          <TextAreaField
            label="Note"
            value={note}
            onChange={setNote}
            rows={2}
            placeholder="What was it for? (optional)"
          />

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={deductible}
              onChange={(e) => setDeductible(e.target.checked)}
              className="h-4 w-4 accent-apex"
            />
            Tax-deductible business expense
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className={buttonClass('primary', 'sm')}
            >
              {pending ? 'Saving…' : 'Save expense'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'sm')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ledger */}
      {initial.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No expenses recorded for this period yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-white/10">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                <th className="px-3 py-2.5 font-normal">Date</th>
                <th className="px-3 py-2.5 font-normal">Category</th>
                <th className="px-3 py-2.5 font-normal">Vendor</th>
                <th className="px-3 py-2.5 text-right font-normal">Amount</th>
                <th className="px-3 py-2.5 text-center font-normal">Deduct.</th>
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
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">
                    {formatMoney(e.amountCents)}
                  </td>
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

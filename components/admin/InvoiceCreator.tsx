'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Raise an invoice (admin/manager).
//
// Line amounts are entered in DOLLARS and sent as integer cents, matching the
// API and the payments ledger. The total shown here is a live PREVIEW; the
// server recomputes it from the same line data on POST, so a tampered total in
// the request is ignored — the invoice is only ever worth the sum of its lines.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, buttonClass } from '@/components/ui';
import { InputField, SelectField } from '@/components/Field';
import { formatMoney } from '@/lib/pricing';

interface CustomerOption {
  id: string;
  label: string;
}

interface Line {
  label: string;
  qty: string;
  unit: string;
}

export default function InvoiceCreator({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [userId, setUserId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ label: '', qty: '1', unit: '' }]);

  // Tip is a percentage of the subtotal, chosen from presets, with a custom
  // dollar override. `tipPct = null` means a custom amount is in force; 0 means
  // no tip. No state tax is applied — the invoice total is services + tip only.
  const [tipPct, setTipPct] = useState<number | null>(0);
  const [tipCustom, setTipCustom] = useState('');

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { label: '', qty: '1', unit: '' }]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const subtotalCents = lines.reduce(
    (sum, l) => sum + Math.max(0, Math.round(Number(l.unit) * 100)) * Math.max(0, Number(l.qty) || 0),
    0
  );
  const tipCents =
    tipPct === null
      ? Math.max(0, Math.round(Number(tipCustom) * 100))
      : Math.round((subtotalCents * tipPct) / 100);
  const totalCents = subtotalCents + tipCents;

  const TIP_PRESETS = [0, 10, 15, 20];

  const validLines = lines.filter((l) => l.label.trim() && Number(l.qty) > 0 && Number(l.unit) >= 0);
  const canSubmit = !!userId && validLines.length > 0 && !pending;

  async function submit(status: 'draft' | 'sent') {
    setPending(true);
    setBanner('');
    setErrors({});
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          status,
          tipCents,
          lines: validLines.map((l) => ({
            label: l.label.trim(),
            qty: Number(l.qty),
            unitCents: Math.round(Number(l.unit) * 100),
          })),
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
      // Straight to the new invoice — the next action (charge, send) lives there.
      router.push(`/admin/invoices/${data.invoice.id}`);
      router.refresh();
    } catch {
      setBanner('We could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass('primary', 'sm')}>
        + New invoice
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-sm border border-white/10 bg-white/[0.02] p-4">
      {banner && <Alert tone="danger">{banner}</Alert>}

      <SelectField
        label="Customer"
        value={userId}
        onChange={setUserId}
        required
        error={errors.userId}
        placeholder="Choose a customer"
        options={customers.map((c) => ({ value: c.id, label: c.label }))}
      />

      <div className="space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">Line items</p>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
            <InputField
              label={i === 0 ? 'Description' : ''}
              value={l.label}
              onChange={(v) => setLine(i, { label: v })}
              placeholder="e.g. Premium Full Detail"
            />
            <div className="w-16">
              <InputField
                label={i === 0 ? 'Qty' : ''}
                value={l.qty}
                onChange={(v) => setLine(i, { qty: v.replace(/[^0-9]/g, '') })}
                inputMode="numeric"
              />
            </div>
            <div className="w-24">
              <InputField
                label={i === 0 ? 'Unit $' : ''}
                value={l.unit}
                onChange={(v) => setLine(i, { unit: v.replace(/[^0-9.]/g, '') })}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={lines.length === 1}
              aria-label="Remove line"
              className="mb-1 px-2 py-2 text-subtle transition-colors hover:text-apex disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={addLine} className={buttonClass('ghost', 'sm', 'px-0')}>
          + Add line
        </button>
      </div>

      {/* Tip — percentage of the subtotal, or a custom amount. No sales tax is
          added; the total is services + tip. */}
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">Tip</p>
        <div className="flex flex-wrap gap-2">
          {TIP_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => {
                setTipPct(pct);
                setTipCustom('');
              }}
              className={`rounded-sm border px-3.5 py-1.5 font-mono text-[12px] transition-colors ${
                tipPct === pct
                  ? 'border-apex bg-apex/10 text-white'
                  : 'border-white/15 text-muted hover:border-white/40 hover:text-white'
              }`}
            >
              {pct === 0 ? 'None' : `${pct}%`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTipPct(null)}
            className={`rounded-sm border px-3.5 py-1.5 font-mono text-[12px] transition-colors ${
              tipPct === null
                ? 'border-apex bg-apex/10 text-white'
                : 'border-white/15 text-muted hover:border-white/40 hover:text-white'
            }`}
          >
            Custom
          </button>
          {tipPct === null && (
            <div className="w-28">
              <InputField
                label=""
                value={tipCustom}
                onChange={(v) => setTipCustom(v.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="$ amount"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1 border-t border-white/10 pt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-subtle">Subtotal</span>
          <span className="font-mono text-muted">{formatMoney(subtotalCents)}</span>
        </div>
        {tipCents > 0 && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-subtle">
              Tip{tipPct ? ` (${tipPct}%)` : ''}
            </span>
            <span className="font-mono text-muted">{formatMoney(tipCents)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <span className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">Total</span>
          <span className="font-mono text-xl text-white">{formatMoney(totalCents)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => submit('sent')}
          className={buttonClass('primary', 'sm')}
        >
          {pending ? 'Saving…' : 'Create & issue'}
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => submit('draft')}
          className={buttonClass('secondary', 'sm')}
        >
          Save as draft
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'sm')}>
          Cancel
        </button>
      </div>
    </div>
  );
}

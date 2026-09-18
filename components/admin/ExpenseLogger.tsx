'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Log an expense — the one entry form, used from Reports and the ledger.
//
// Built for the driveway: pick a category (fuel, materials, labor…), type the
// amount, snap the receipt with the phone camera, optionally tie it to the
// job it was for, add a note. Receipt bytes go through /api/uploads (scope
// 'receipts', managers+), then the expense is written with the stored key.
//
// Amounts are typed in DOLLARS and converted to integer cents once, here, at
// the boundary — everything downstream (totals, tax export) stays integer.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Alert, buttonClass } from '@/components/ui';
import { InputField, SelectField, TextAreaField } from '@/components/Field';
import type { ExpenseCategoryDef } from '@/lib/models';

export interface JobOption {
  id: string;
  label: string;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ExpenseLogger({
  categories,
  jobs,
  buttonLabel = 'Log expense',
  defaultOpen = false,
  fullWidth = false,
  onSaved,
}: {
  categories: ExpenseCategoryDef[];
  /** Recent bookings the spend can be tied to, newest first. */
  jobs: JobOption[];
  buttonLabel?: string;
  defaultOpen?: boolean;
  /** Stretch the closed button (and the open form) edge to edge. */
  fullWidth?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(defaultOpen);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState('');
  const [saved, setSaved] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [spentOn, setSpentOn] = useState(todayIso());
  const [category, setCategory] = useState<string>(categories[0]?.id ?? 'fuel');
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [jobId, setJobId] = useState('');
  const [note, setNote] = useState('');
  const [deductible, setDeductible] = useState(true);
  const [receipt, setReceipt] = useState<{ key: string; url: string } | null>(null);

  async function onPickReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setBanner('');
    try {
      const form = new FormData();
      form.set('scope', 'receipts');
      form.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'That upload failed.');
      setReceipt({ key: data.files[0].key, url: data.files[0].url });
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'That upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setPending(true);
    setBanner('');
    setSaved('');
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
          appointmentId: jobId || null,
          receiptKey: receipt?.key ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrors(data.errors ?? {});
        if (!Object.keys(data.errors ?? {}).length) setBanner(data.error ?? 'That did not save. Please try again.');
        return;
      }
      // Keep date + category (receipts come in runs); clear the rest.
      setAmount('');
      setVendor('');
      setNote('');
      setJobId('');
      setReceipt(null);
      setSaved(`Saved $${(data.expense.amountCents / 100).toFixed(2)} — ${categories.find((c) => c.id === data.expense.category)?.label ?? ''}.`);
      router.refresh();
      onSaved?.();
    } catch {
      setBanner('We could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  const canSubmit = spentOn && category && Number(amount) > 0 && !pending && !uploading;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass('primary', fullWidth ? 'md' : 'sm', fullWidth ? 'w-full' : undefined)}
      >
        + {buttonLabel}
      </button>
    );
  }

  return (
    <div className={clsx('space-y-4 rounded-sm border border-white/10 bg-white/[0.02] p-4', fullWidth && 'w-full')}>
      {banner && <Alert tone="danger">{banner}</Alert>}
      {saved && <Alert tone="positive">{saved}</Alert>}

      {/* Category first — it is the thing you know before you know the amount. */}
      <SelectField
        label="What was it for?"
        value={category}
        onChange={setCategory}
        required
        error={errors.category}
        options={categories.map((c) => ({ value: c.id, label: c.label }))}
        hint={categories.find((c) => c.id === category)?.scheduleC}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Amount (USD)"
          value={amount}
          onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          placeholder="0.00"
          required
          error={errors.amountCents}
        />
        <InputField
          label="Date"
          type="date"
          value={spentOn}
          onChange={setSpentOn}
          required
          max={todayIso()}
          error={errors.spentOn}
        />
        <InputField label="Vendor / payee" value={vendor} onChange={setVendor} placeholder="e.g. Chemical Guys, Shell" />
        <SelectField
          label="Tie to a job"
          value={jobId}
          onChange={setJobId}
          placeholder="Not for a specific job"
          options={jobs.map((j) => ({ value: j.id, label: j.label }))}
          error={errors.appointmentId}
          hint="Optional — links the spend to a booking so job costs add up."
        />
      </div>

      {/* Receipt: the phone camera on mobile, a file picker on desktop. */}
      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest2 text-subtle">Receipt</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={onPickReceipt}
          aria-label="Photograph or choose a receipt"
        />
        {receipt ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receipt.url} alt="Receipt" className="h-20 w-20 rounded-sm border border-white/10 object-cover" />
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass('secondary', 'sm')}>
                Retake
              </button>
              <button type="button" onClick={() => setReceipt(null)} className="text-left text-[12px] text-subtle hover:text-white">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className={buttonClass('secondary', 'sm')}
          >
            {uploading ? 'Uploading…' : '📷 Scan / photograph receipt'}
          </button>
        )}
        {errors.receiptKey && <p className="mt-1 text-[12px] text-flare">{errors.receiptKey}</p>}
      </div>

      <TextAreaField
        label="Comment"
        value={note}
        onChange={setNote}
        rows={2}
        placeholder="Anything worth remembering about this expense (optional)"
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
        <button type="button" disabled={!canSubmit} onClick={submit} className={buttonClass('primary', 'sm')}>
          {pending ? 'Saving…' : 'Save expense'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass('ghost', 'sm')}>
          Close
        </button>
      </div>
    </div>
  );
}

'use client';

import { InputField, TextAreaField } from '../Field';
import { formatPrice } from '@/lib/pricing';
import { EstimateResult } from '@/lib/types';
import { FormState } from './EstimateModal';

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  errors: Record<string, string>;
  estimate: EstimateResult | null;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

/** Format US digits as the user types: (555) 019-2244 */
function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function StepContact({
  form,
  set,
  errors,
  estimate,
  submitting,
  onBack,
  onSubmit,
}: Props) {
  const today = new Date();
  // Local date, not toISOString() — the latter shifts the day for anyone west
  // of UTC and would let a customer pick "today" and have it rejected.
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;

  const canSubmit =
    form.name.trim().length >= 2 &&
    form.email.includes('@') &&
    form.phone.replace(/\D/g, '').length === 10 &&
    !submitting;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <h2 id="estimate-dialog-title" className="font-display text-2xl font-bold">
        Where should we send it?
      </h2>
      <p className="mt-2 text-sm text-muted">
        We&rsquo;ll confirm your estimate and arrange a time that works.
      </p>

      <div className="mt-7 flex flex-col gap-5">
        <InputField
          label="Full name"
          required
          value={form.name}
          onChange={(v) => set('name', v)}
          placeholder="Jordan Reyes"
          autoComplete="name"
          error={errors.name}
          maxLength={100}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <InputField
            label="Email"
            required
            type="email"
            inputMode="email"
            value={form.email}
            onChange={(v) => set('email', v)}
            placeholder="you@example.com"
            autoComplete="email"
            error={errors.email}
            maxLength={254}
          />
          <InputField
            label="Phone"
            required
            type="tel"
            inputMode="tel"
            value={formatPhone(form.phone)}
            onChange={(v) => set('phone', v.replace(/\D/g, '').slice(0, 10))}
            placeholder="(555) 019-2244"
            autoComplete="tel"
            error={errors.phone}
          />
        </div>

        <InputField
          label="Preferred date"
          type="date"
          value={form.preferredDate}
          onChange={(v) => set('preferredDate', v)}
          min={minDate}
          error={errors.preferredDate}
          hint="Optional — we'll confirm the exact slot with you."
        />

        <TextAreaField
          label="Notes"
          value={form.notes}
          onChange={(v) => set('notes', v)}
          placeholder="Anything we should know — problem areas, paint condition, access, storage location…"
          rows={3}
          maxLength={2000}
          error={errors.notes}
        />

        {/* TCPA: express written consent is required before sending a marketing
            or transactional SMS. Unchecked by default and never pre-ticked —
            a pre-checked box does not constitute consent. */}
        <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-white/20 px-4 py-3.5 transition-colors hover:border-white/35">
          <input
            type="checkbox"
            checked={form.smsConsent}
            onChange={(e) => set('smsConsent', e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-apex"
          />
          <span className="text-[13px] leading-snug text-muted">
            Text me updates about this request. Message and data rates may apply; reply STOP to
            opt out at any time. Optional — we&rsquo;ll email you either way.
          </span>
        </label>
      </div>

      {estimate && (
        <div className="mt-6 flex items-baseline justify-between gap-4 rounded-sm border border-white/15 bg-white/[0.03] px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
            Your estimate
          </span>
          <span className="font-mono text-lg text-white">
            {formatPrice(estimate.total, estimate.totalMax)}
          </span>
        </div>
      )}

      <div className="mt-7 flex gap-3">
        <button type="button" onClick={onBack} className="btn-ghost" disabled={submitting}>
          Back
        </button>
        <button type="submit" disabled={!canSubmit} className="btn-apex flex-1">
          {submitting ? 'Sending…' : 'Send My Request'}
        </button>
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-subtle">
        No payment is taken now. We&rsquo;ll confirm pricing and timing before any work begins.
      </p>
    </form>
  );
}

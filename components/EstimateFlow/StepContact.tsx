'use client';

import { InputField, TextAreaField } from '../Field';
import { useIndustry } from '../IndustryProvider';
import SlotPicker from './SlotPicker';
import { FormState } from './EstimateModal';

interface Props {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  errors: Record<string, string>;
  onBack: () => void;
  onNext: () => void;
}

/** Format US digits as the user types: (555) 019-2244 */
function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "Friday, June 6 · 9:00 AM" from an ISO instant. */
function describeSlot(startsAt: string): string {
  return new Date(startsAt).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function StepContact({ form, set, errors, onBack, onNext }: Props) {
  const { industry } = useIndustry();

  const canContinue =
    form.name.trim().length >= 2 &&
    form.email.includes('@') &&
    form.phone.replace(/\D/g, '').length === 10;

  return (
    <div>
      <h2 id="estimate-dialog-title" className="font-display text-2xl font-bold">
        Your details &amp; a time
      </h2>
      <p className="mt-2 text-sm text-muted">
        We&rsquo;ll confirm your estimate and lock in the slot you choose.
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

        {/* ── Live availability ──────────────────────────────────────────────
            Real open slots, computed server-side from business hours and every
            existing booking. Optional: a customer who is flexible can skip it
            and we arrange a time by phone. */}
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <label className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Preferred time
            </label>
            <span className="text-[11px] text-subtle">Optional</span>
          </div>

          {form.startsAt ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-sm border border-apex/40 bg-apex/10 px-4 py-3">
              <span className="text-sm text-white">{describeSlot(form.startsAt)}</span>
              <button
                type="button"
                onClick={() => set('startsAt', '')}
                className="shrink-0 font-mono text-[11px] uppercase tracking-widest2 text-muted transition-colors hover:text-white"
              >
                Change
              </button>
            </div>
          ) : (
            <p className="mb-3 text-[13px] text-muted">
              Choose a slot below, or leave it and we&rsquo;ll find a time together.
            </p>
          )}

          {form.sizeClass && form.serviceIds.length > 0 && (
            <SlotPicker
              industry={industry}
              size={form.sizeClass}
              serviceIds={form.serviceIds}
              addOnIds={form.addOnIds}
              value={form.startsAt}
              onChange={(startsAt, dateIso) => {
                set('startsAt', startsAt);
                // Keep the plain-date field in step for the stored record and
                // the owner's estimate queue.
                set('preferredDate', startsAt ? dateIso : '');
              }}
            />
          )}
          {errors.startsAt && (
            <p className="mt-2 text-[13px] text-flare">{errors.startsAt}</p>
          )}
        </div>

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

      <div className="mt-7 flex gap-3">
        <button type="button" onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button type="button" onClick={onNext} disabled={!canContinue} className="btn-apex flex-1">
          Review Estimate
        </button>
      </div>
    </div>
  );
}

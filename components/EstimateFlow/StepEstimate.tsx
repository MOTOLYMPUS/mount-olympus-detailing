'use client';

import { EstimateResult } from '@/lib/types';
import { formatHours, formatPrice } from '@/lib/pricing';
import { sizeLabel } from '@/lib/industries';
import { useIndustry } from '../IndustryProvider';
import { FormState } from './EstimateModal';

interface Props {
  estimate: EstimateResult | null;
  form: FormState;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
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

export default function StepEstimate({ estimate, form, submitting, onBack, onSubmit }: Props) {
  const { config } = useIndustry();

  // Defensive: the previous build rendered an empty modal with no way out when
  // its estimate was null. This step always renders a Back button.
  if (!estimate) {
    return (
      <div>
        <h2 id="estimate-dialog-title" className="font-display text-2xl font-bold">
          Nothing to price yet
        </h2>
        <p className="mt-2 text-sm text-muted">
          Those services aren&rsquo;t available for the size you picked. Go back and choose again.
        </p>
        <button onClick={onBack} className="btn-ghost mt-8">
          Back
        </button>
      </div>
    );
  }

  const services = estimate.lines.filter((l) => l.kind === 'service');
  const addOns = estimate.lines.filter((l) => l.kind === 'addon');

  return (
    <div>
      <h2 id="estimate-dialog-title" className="font-display text-2xl font-bold">
        Your estimate
      </h2>
      <p className="mt-2 text-sm text-muted">
        {form.year} {form.make} {form.model}
        {form.sizeClass && ` · ${sizeLabel(form.sizeClass)}`}
      </p>

      <div className="glass-panel mt-7 rounded-md p-6">
        <p className="eyebrow mb-4">Services</p>
        <div className="flex flex-col gap-2.5 font-mono text-sm">
          {services.map((l) => (
            <Row key={l.id} label={l.label} value={formatPrice(l.price, l.priceMax)} />
          ))}
        </div>

        {addOns.length > 0 && (
          <>
            <div className="hairline my-5" />
            <p className="eyebrow mb-4">Add-ons</p>
            <div className="flex flex-col gap-2.5 font-mono text-sm">
              {addOns.map((l) => (
                <Row key={l.id} label={l.label} value={formatPrice(l.price, l.priceMax)} />
              ))}
            </div>
          </>
        )}

        <div className="hairline my-5" />

        <div className="flex flex-col gap-2.5 font-mono text-sm">
          <Row label="Services subtotal" value={formatPrice(estimate.basePrice, estimate.basePriceMax)} />
          {addOns.length > 0 && (
            <Row
              label="Add-ons subtotal"
              value={formatPrice(estimate.addOnPrice, estimate.addOnPriceMax)}
            />
          )}
        </div>

        <div className="hairline my-5" />

        <div className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
            Estimated total
          </span>
          <span className="font-mono text-2xl font-semibold text-white sm:text-3xl">
            {formatPrice(estimate.total, estimate.totalMax)}
          </span>
        </div>

        <p className="mt-3 font-mono text-[11px] uppercase tracking-widest2 text-muted">
          Estimated time · {formatHours(estimate.estimatedHours)}
        </p>
      </div>

      {form.startsAt && (
        <div className="mt-4 flex items-baseline justify-between gap-4 rounded-sm border border-white/15 bg-white/[0.03] px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
            Requested time
          </span>
          <span className="text-sm text-white">{describeSlot(form.startsAt)}</span>
        </div>
      )}

      {estimate.isPlaceholderPricing ? (
        <p className="mt-4 rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
          <strong className="font-semibold">Indicative pricing.</strong> {config.label} rates are
          still being finalised — this figure is a guide only and will be confirmed in writing
          before any work is scheduled.
        </p>
      ) : (
        <p className="mt-4 text-[13px] leading-relaxed text-subtle">
          Final pricing is confirmed after an in-person inspection. Heavier contamination or
          correction work may adjust the total — we&rsquo;ll always tell you before starting.
        </p>
      )}

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost" disabled={submitting}>
          Back
        </button>
        <button onClick={onSubmit} disabled={submitting} className="btn-apex flex-1">
          {submitting ? 'Sending…' : 'Submit Request'}
        </button>
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-subtle">
        No payment is taken now. We&rsquo;ll confirm pricing and timing before any work begins.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="shrink-0 text-white">{value}</span>
    </div>
  );
}

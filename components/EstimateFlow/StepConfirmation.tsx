'use client';

import { formatPrice } from '@/lib/pricing';
import { bookingUrl, business } from '@/lib/business';
import { FormState } from './EstimateModal';

export interface SubmitSuccess {
  ok: true;
  reference: string;
  quotedTotal: number;
  quotedTotalMax: number;
  estimatedHours: number;
  isPlaceholderPricing: boolean;
  notifications: {
    customerEmail: string;
    businessEmail: string;
    customerSms: string;
    businessSms: string;
  } | null;
}

export default function StepConfirmation({
  result,
  form,
  onClose,
}: {
  result: SubmitSuccess;
  form: FormState;
  onClose: () => void;
}) {
  // Report what actually happened rather than asserting an email was sent.
  // The previous build claimed "a confirmation has been sent" unconditionally,
  // with no email system behind it at all.
  const emailSent = result.notifications?.customerEmail === 'sent';
  const smsSent = result.notifications?.customerSms === 'sent';

  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-apex">
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
          <path d="M1 8L7 14L19 1" stroke="#D4001A" strokeWidth="2" />
        </svg>
      </div>

      <h2 id="estimate-dialog-title" className="mt-6 font-display text-2xl font-bold">
        Request received.
      </h2>

      <p className="mt-2 text-sm text-muted">
        {emailSent ? (
          <>
            We&rsquo;ve emailed a copy to <span className="text-white">{form.email}</span>.
            We&rsquo;ll be in touch shortly to confirm.
          </>
        ) : (
          <>
            Your request is saved and our team has it. We&rsquo;ll contact you at{' '}
            <span className="text-white">{form.email}</span> shortly to confirm.
          </>
        )}
      </p>

      <div className="glass-panel mx-auto mt-7 max-w-sm rounded-md p-5 text-left font-mono text-sm">
        <Row label="Reference" value={result.reference} strong />
        <Row label="Vehicle" value={`${form.year} ${form.make} ${form.model}`} />
        <Row
          label="Estimate"
          value={formatPrice(result.quotedTotal, result.quotedTotalMax)}
        />
        <Row label="Est. time" value={`${result.estimatedHours} hrs`} />
        {form.preferredDate && <Row label="Preferred" value={form.preferredDate} />}
      </div>

      {result.isPlaceholderPricing && (
        <p className="mx-auto mt-4 max-w-sm rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-[12px] leading-relaxed text-amber-200">
          This figure is indicative — we&rsquo;ll confirm final pricing in writing before
          scheduling.
        </p>
      )}

      {form.smsConsent && !smsSent && (
        <p className="mx-auto mt-3 max-w-sm text-[12px] leading-relaxed text-subtle">
          SMS updates aren&rsquo;t switched on yet — we&rsquo;ll reach you by email and phone.
        </p>
      )}

      <p className="mt-5 text-[12px] leading-relaxed text-subtle">
        Keep your reference handy — quoting it gets you straight to your request. Questions? Call
        or text{' '}
        <a href={business.phoneHref} className="text-white underline">
          {business.phone}
        </a>
        .
      </p>

      {/* Only rendered when NEXT_PUBLIC_BOOKING_URL is configured, so there is
          never a dead "book now" button. */}
      {bookingUrl ? (
        <div className="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-apex flex-1"
          >
            Book Your Slot
          </a>
          <button onClick={onClose} className="btn-ghost">
            Done
          </button>
        </div>
      ) : (
        <button onClick={onClose} className="btn-apex mt-7 w-full sm:w-auto">
          Done
        </button>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="mb-2.5 flex justify-between gap-4 last:mb-0">
      <span className="text-[11px] uppercase tracking-widest2 text-subtle">{label}</span>
      <span className={`text-right ${strong ? 'font-semibold text-white' : 'text-white/90'}`}>
        {value}
      </span>
    </div>
  );
}

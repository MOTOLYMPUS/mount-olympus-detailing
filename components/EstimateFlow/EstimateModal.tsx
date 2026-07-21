'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIndustry } from '../IndustryProvider';
import { useDialog, usePrefersReducedMotion } from '@/lib/useDialog';
import { calculateEstimate } from '@/lib/pricing';
import { SizeClass } from '@/lib/types';
import ProgressIndicator from './ProgressIndicator';
import StepVehicle from './StepVehicle';
import StepServices from './StepServices';
import StepEstimate from './StepEstimate';
import StepContact from './StepContact';
import StepConfirmation, { SubmitSuccess } from './StepConfirmation';

export interface EstimatePrefill {
  serviceIds?: string[];
  addOnIds?: string[];
  sizeClass?: SizeClass;
}

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: EstimatePrefill;
}

export const STEPS = ['Vehicle', 'Services', 'Estimate', 'Details', 'Sent'];

export interface FormState {
  vehicleType: string;
  make: string;
  model: string;
  year: string;
  sizeClass: SizeClass | '';
  serviceIds: string[];
  addOnIds: string[];
  name: string;
  email: string;
  phone: string;
  preferredDate: string;
  notes: string;
  smsConsent: boolean;
}

const EMPTY: FormState = {
  vehicleType: '',
  make: '',
  model: '',
  year: '',
  sizeClass: '',
  serviceIds: [],
  addOnIds: [],
  name: '',
  email: '',
  phone: '',
  preferredDate: '',
  notes: '',
  smsConsent: false,
};

export default function EstimateModal({ open, onClose, prefill }: Props) {
  const { industry, config } = useIndustry();
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SubmitSuccess | null>(null);

  useDialog(open, onClose, panelRef);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Apply the prefill carried in from a service card or the inline calculator.
  // The whole selection travels — size class, services, and add-ons — so the
  // number the customer agreed to is the number the wizard opens with.
  const prefillKey = prefill
    ? `${prefill.sizeClass ?? ''}|${(prefill.serviceIds ?? []).join(',')}|${(
        prefill.addOnIds ?? []
      ).join(',')}`
    : '';

  useEffect(() => {
    if (!open || !prefill) return;

    setForm((f) => {
      const next = { ...f };

      if (prefill.sizeClass) {
        next.sizeClass = prefill.sizeClass;
        // Derive the category from the size class so the vehicle step opens
        // consistent rather than half-filled.
        const type = config.vehicleTypes.find((t) => t.sizes.includes(prefill.sizeClass!));
        if (type) next.vehicleType = type.id;
      }
      if (prefill.serviceIds?.length) {
        next.serviceIds = Array.from(new Set([...f.serviceIds, ...prefill.serviceIds]));
      }
      if (prefill.addOnIds?.length) {
        next.addOnIds = Array.from(new Set([...f.addOnIds, ...prefill.addOnIds]));
      }
      return next;
    });
    // `config` is stable per industry; keying on prefillKey avoids re-running
    // this on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillKey]);

  // Switching industry invalidates every industry-scoped selection. Clearing
  // them is what stops a marine service id surviving into an automotive quote.
  //
  // Guarded against firing on mount — otherwise it would run after the prefill
  // effect above and wipe the selection the customer just made outside.
  const prevIndustry = useRef(industry);
  useEffect(() => {
    if (prevIndustry.current === industry) return;
    prevIndustry.current = industry;

    setForm((f) => ({
      ...f,
      vehicleType: '',
      sizeClass: '',
      make: '',
      model: '',
      serviceIds: [],
      addOnIds: [],
    }));
    setErrors({});
    setStep(0);
  }, [industry]);

  // Reset after the close animation finishes.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep(0);
      setForm(EMPTY);
      setErrors({});
      setSubmitting(false);
      setSuccess(null);
    }, 320);
    return () => clearTimeout(t);
  }, [open]);

  const estimate = useMemo(
    () =>
      calculateEstimate({
        industry,
        size: form.sizeClass || null,
        serviceIds: form.serviceIds,
        addOnIds: form.addOnIds,
      }),
    [industry, form.sizeClass, form.serviceIds, form.addOnIds]
  );

  async function submit() {
    setSubmitting(true);
    setErrors({});
    try {
      const res = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          industry,
          vehicleType: form.vehicleType,
          make: form.make,
          model: form.model,
          year: form.year,
          sizeClass: form.sizeClass,
          serviceIds: form.serviceIds,
          addOnIds: form.addOnIds,
          preferredDate: form.preferredDate || null,
          notes: form.notes,
          smsConsent: form.smsConsent,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErrors(data.errors ?? { _: 'Something went wrong. Please try again.' });
        setSubmitting(false);
        return;
      }

      setSuccess(data as SubmitSuccess);
      setStep(4);
    } catch {
      setErrors({
        _: 'We could not reach the server. Check your connection and try again, or call us directly.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2 }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-obsidian/85 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(e) => {
            // Only close on a click that both starts and ends on the backdrop —
            // otherwise dragging a slider inside and releasing outside closes it.
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="estimate-dialog-title"
            initial={reduced ? false : { y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => e.stopPropagation()}
            className="glass-panel flex max-h-[92svh] w-full max-w-xl flex-col rounded-t-lg shadow-glass outline-none sm:rounded-md"
          >
            {/* Header — stays put while the body scrolls. */}
            <div className="shrink-0 px-6 pb-3 pt-6 sm:px-8 sm:pt-7">
              <div className="mb-3 flex items-center justify-between gap-4">
                <p className="eyebrow">
                  {config.label} — Estimate Request
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close estimate request"
                  className="-mr-1 rounded-sm p-1 text-muted transition-colors hover:text-white"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              </div>
              <ProgressIndicator steps={STEPS} current={step} />
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8 sm:pb-8">
              {/* Announces step changes to screen readers, which the old
                  wizard did silently. */}
              <p aria-live="polite" className="sr-only">
                Step {step + 1} of {STEPS.length}: {STEPS[step]}
              </p>

              {errors._ && (
                <div
                  role="alert"
                  className="mb-5 rounded-sm border border-apex/50 bg-apex/10 px-4 py-3 text-sm text-white"
                >
                  {errors._}
                </div>
              )}

              {step === 0 && (
                <StepVehicle
                  form={form}
                  set={set}
                  errors={errors}
                  onNext={() => setStep(1)}
                />
              )}
              {step === 1 && (
                <StepServices
                  form={form}
                  set={set}
                  onBack={() => setStep(0)}
                  onNext={() => setStep(2)}
                />
              )}
              {step === 2 && (
                <StepEstimate
                  estimate={estimate}
                  form={form}
                  onBack={() => setStep(1)}
                  onNext={() => setStep(3)}
                />
              )}
              {step === 3 && (
                <StepContact
                  form={form}
                  set={set}
                  errors={errors}
                  estimate={estimate}
                  submitting={submitting}
                  onBack={() => setStep(2)}
                  onSubmit={submit}
                />
              )}
              {step === 4 && success && (
                <StepConfirmation result={success} form={form} onClose={onClose} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

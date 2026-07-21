'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookingState, ServiceId, VehicleInfo } from '@/lib/types';
import { calculateEstimate } from '@/lib/pricing';
import ProgressIndicator from './ProgressIndicator';
import StepVehicle from './StepVehicle';
import StepService from './StepService';
import StepEstimate from './StepEstimate';
import StepCalendar from './StepCalendar';
import StepPayment from './StepPayment';
import StepConfirmation from './StepConfirmation';

export interface BookingPrefill {
  make?: string;
  model?: string;
  year?: string;
  serviceId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  prefill: BookingPrefill;
}

const EMPTY_VEHICLE: VehicleInfo = { make: '', model: '', year: '', size: 'coupe' };

export default function BookingModal({ open, onClose, prefill }: Props) {
  const [step, setStep] = useState(0);
  const [vehicle, setVehicle] = useState<VehicleInfo>(EMPTY_VEHICLE);
  const [selectedServices, setSelectedServices] = useState<ServiceId[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [depositOnly, setDepositOnly] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVehicle((v) => ({
      ...v,
      make: prefill.make ?? v.make,
      model: prefill.model ?? v.model,
      year: prefill.year ?? v.year,
    }));
    if (prefill.serviceId && prefill.serviceId !== 'luxury-package') {
      setSelectedServices((s) =>
        s.includes(prefill.serviceId as ServiceId) ? s : [...s, prefill.serviceId as ServiceId]
      );
    }
  }, [open, prefill]);

  useEffect(() => {
    if (!open) {
      // reset after close animation
      const t = setTimeout(() => {
        setStep(0);
        setVehicle(EMPTY_VEHICLE);
        setSelectedServices([]);
        setDate(null);
        setTime(null);
        setDepositOnly(true);
        setProcessing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const estimate = calculateEstimate(vehicle.size, selectedServices);

  const toggleService = (id: ServiceId) =>
    setSelectedServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const handlePay = () => {
    setProcessing(true);
    // Placeholder for real Stripe PaymentIntent confirmation call.
    setTimeout(() => {
      setProcessing(false);
      setStep(5);
    }, 1100);
  };

  const booking: BookingState = {
    vehicle,
    selectedServices,
    estimate,
    date,
    time,
    depositOnly,
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-obsidian/80 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel max-h-[92svh] w-full max-w-xl overflow-y-auto rounded-t-lg p-7 shadow-glass sm:rounded-md sm:p-9"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="eyebrow">Book an Appointment</p>
              <button onClick={onClose} aria-label="Close booking" className="text-white/50 hover:text-white">
                ✕
              </button>
            </div>

            <ProgressIndicator current={step} />

            {step === 0 && (
              <StepVehicle vehicle={vehicle} onChange={setVehicle} onNext={() => setStep(1)} />
            )}
            {step === 1 && (
              <StepService
                selected={selectedServices}
                onToggle={toggleService}
                onNext={() => setStep(2)}
                onBack={() => setStep(0)}
              />
            )}
            {step === 2 && estimate && (
              <StepEstimate estimate={estimate} onNext={() => setStep(3)} onBack={() => setStep(1)} />
            )}
            {step === 3 && (
              <StepCalendar
                date={date}
                time={time}
                onSelect={(d, t) => {
                  setDate(d);
                  setTime(t);
                }}
                onNext={() => setStep(4)}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && estimate && (
              <StepPayment
                estimate={estimate}
                depositOnly={depositOnly}
                onDepositOnlyChange={setDepositOnly}
                onPay={handlePay}
                onBack={() => setStep(3)}
                processing={processing}
              />
            )}
            {step === 5 && <StepConfirmation booking={booking} onClose={onClose} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

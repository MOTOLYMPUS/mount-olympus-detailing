'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The booking wizard.
//
// Five steps: vehicle → services → where → when → confirm.
//
// TWO THINGS TO KNOW BEFORE CHANGING THIS
//
//  1. The price shown here is a PREVIEW. It is computed with the same
//     `calculateEstimate()` the server uses, from the same tables, so it
//     agrees — but the server recomputes it on submit and its number is the one
//     that gets stored. Never send a total up and expect it to be honoured.
//
//  2. Slots are fetched from /api/availability, which already applies business
//     hours, shifts, time off, holidays, travel, buffer and notice. This
//     component must not re-implement any of that; if a slot looks wrong, the
//     bug is in lib/availability.ts.
//
// Availability is re-fetched whenever the selection changes duration, because a
// 90-minute wash and a 6-hour correction do not fit the same gaps.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChoiceCard, InputField, TextAreaField } from '@/components/Field';
import { Alert, Card, buttonClass } from '@/components/ui';
import { Skeleton } from '@/components/visual/Skeleton';
import { Motes } from '@/components/visual/Effects';
import { Vehicle, vehicleLabel } from '@/lib/models';
import { usePrefersReducedMotion } from '@/lib/useDialog';
import { availableAddOns, availableServices, calculateEstimate, formatHours, formatPrice, priceFor } from '@/lib/pricing';
import { usePriceOverrides } from '@/components/pricing/usePriceOverrides';
import { sizeLabel } from '@/lib/industries';

interface Slot {
  startsAt: string;
  endsAt: string;
  label: string;
  period: 'morning' | 'afternoon' | 'evening';
  available: boolean;
}

interface DayResult {
  dateIso: string;
  closedReason?: string;
  openCount: number;
  slots: Slot[];
}

const STEPS = ['Vehicle', 'Services', 'Where', 'When', 'Confirm'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// STEP TRANSITION
//
// Enter-only, and no AnimatePresence. Two reasons, both about the wait:
//
//   • `AnimatePresence mode="wait"` would play the outgoing step out before
//     the incoming one starts — the durations ADD UP, so a 180ms transition
//     becomes a 360ms gap between pressing Continue and seeing the next
//     question. In a five-step wizard that is nearly two seconds of nothing.
//   • Remounting on `key={step}` gives the new content its own entrance for
//     free, and the old content simply goes.
//
// 200ms, transform and opacity only, and collapsed to zero under reduced
// motion — the whole animation is one composited layer either way.
// ─────────────────────────────────────────────────────────────────────────────
function stepMotion(reduced: boolean) {
  return {
    initial: reduced ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] as const },
  };
}

/**
 * Shimmer for the availability fetch.
 *
 * Shaped as the day strip plus two groups of time chips, because that is what
 * replaces it. A spinner here would tell the customer to wait; this tells them
 * what they are waiting for, and it holds the height so the Continue button
 * does not jump up the screen and back down.
 */
function SlotsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex gap-2 overflow-hidden pb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] min-w-[64px] shrink-0" />
        ))}
      </div>
      <div className="mt-5 space-y-5">
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g}>
            <Skeleton className="mb-2 h-2.5 w-20" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[38px] w-24" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BookingFlow({
  vehicles,
  defaultAddress,
  preselectedVehicleId,
  preselectedServiceId,
  customerId,
  successHref,
  addVehicleHref = '/app/garage/new',
}: {
  vehicles: Vehicle[];
  defaultAddress: string;
  preselectedVehicleId?: string;
  preselectedServiceId?: string;
  /**
   * STAFF MODE: book on behalf of this customer (phone or text bookings).
   * The API only honours it for managers+; a customer's own session ignores
   * it. The wizard itself is identical — same slots, same pricing.
   */
  customerId?: string;
  /**
   * Where to land after a successful booking, with `{id}` standing for the
   * new appointment id (default: the customer's appointment page). A string
   * template rather than a function because this is a client component fed
   * by server pages, and functions cannot cross that boundary.
   */
  successHref?: string;
  /** Where "add a vehicle" links go (staff mode points at the customer's admin page). */
  addVehicleHref?: string;
}) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const overrides = usePriceOverrides();

  const [step, setStep] = useState(0);
  const [vehicleId, setVehicleId] = useState(
    preselectedVehicleId ?? vehicles.find((v) => v.isDefault)?.id ?? vehicles[0]?.id ?? ''
  );
  const [serviceIds, setServiceIds] = useState<string[]>(
    preselectedServiceId ? [preselectedServiceId] : []
  );
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [locationType, setLocationType] = useState<'mobile' | 'shop'>('mobile');
  const [address, setAddress] = useState(defaultAddress);
  const [dateIso, setDateIso] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [notes, setNotes] = useState('');

  const [days, setDays] = useState<DayResult[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState('');

  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const services = useMemo(
    () => (vehicle ? availableServices(vehicle.industry, vehicle.sizeClass) : []),
    [vehicle]
  );
  const addOns = useMemo(
    () => (vehicle ? availableAddOns(serviceIds, vehicle.sizeClass) : []),
    [serviceIds, vehicle]
  );

  const estimate = useMemo(
    () =>
      vehicle
        ? calculateEstimate({
            industry: vehicle.industry,
            size: vehicle.sizeClass,
            serviceIds,
            addOnIds,
            overrides,
          })
        : null,
    [vehicle, serviceIds, addOnIds, overrides]
  );

  // ── Load availability ─────────────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    if (!vehicle || !serviceIds.length) return;

    setLoadingSlots(true);
    setSlotError('');
    try {
      const params = new URLSearchParams({
        industry: vehicle.industry,
        size: vehicle.sizeClass,
        services: serviceIds.join(','),
        addons: addOnIds.join(','),
        location: locationType,
      });
      const res = await fetch(`/api/availability?${params}`);
      const data = await res.json();
      if (!data.ok) {
        setSlotError(data.error ?? 'We could not load available times.');
        return;
      }
      setDays(data.days ?? []);

      // Preselect the first day that has anything open, so the customer is not
      // dropped onto an empty calendar and left to hunt.
      const firstOpen = (data.days as DayResult[]).find((d) => d.openCount > 0);
      if (firstOpen && !dateIso) setDateIso(firstOpen.dateIso);
    } catch {
      setSlotError('We could not reach the server. Check your connection.');
    } finally {
      setLoadingSlots(false);
    }
    // `dateIso` is deliberately excluded: including it would refetch every time
    // the customer clicks a different day, which the response already covers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle, serviceIds, addOnIds, locationType]);

  useEffect(() => {
    if (step === 3) loadSlots();
  }, [step, loadSlots]);

  const selectedDay = days.find((d) => d.dateIso === dateIso);

  // ── Step gating ───────────────────────────────────────────────────────────
  const canAdvance = [
    !!vehicleId,
    serviceIds.length > 0,
    locationType === 'shop' || address.trim().length > 4,
    !!startsAt,
    true,
  ][step];

  async function submit() {
    if (!vehicle) return;
    setSubmitting(true);
    setBanner('');

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          industry: vehicle.industry,
          sizeClass: vehicle.sizeClass,
          serviceIds,
          addOnIds,
          startsAt,
          locationType,
          address,
          notes,
          // Staff mode only; ignored by the API for a customer's own session.
          ...(customerId ? { customerId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setBanner(data.error ?? 'We could not complete that booking.');
        // A 409 means the slot went while they were deciding. Send them back to
        // the calendar with fresh data rather than leaving a dead button.
        if (res.status === 409) {
          setStartsAt('');
          setStep(3);
          loadSlots();
        }
        return;
      }

      router.push(
        successHref
          ? successHref.replace('{id}', data.appointment.id)
          : `/app/appointments/${data.appointment.id}?new=1`
      );
      router.refresh();
    } catch {
      setBanner('We could not reach the server. Your booking was not made.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!vehicles.length) {
    return (
      <Alert tone="info" title="Add a vehicle first">
        We price by vehicle size, so we need to know what we are working on.{' '}
        <Link href={addVehicleHref} className="underline">
          Add your vehicle
        </Link>{' '}
        and come straight back.
      </Alert>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {/* ── Progress ─────────────────────────────────────────────────────── */}
        {/* A rail under the step labels. `scaleX` on a full-width bar, not an
            animated `width`: width relayouts on every frame, scaleX composites.
            aria-hidden because the <ol> below already states the position, and
            two announcements of the same fact is noise. */}
        <div className="mb-3 h-0.5 w-full overflow-hidden rounded-full bg-white/8" aria-hidden="true">
          <motion.div
            className="h-full origin-left rounded-full bg-apex"
            initial={false}
            animate={{ scaleX: (step + 1) / STEPS.length }}
            transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <ol className="mb-8 flex flex-wrap gap-x-2 gap-y-1" aria-label="Booking steps">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-current={i === step ? 'step' : undefined}
                className={`font-mono text-[11px] uppercase tracking-widest2 ${
                  i === step ? 'text-flare' : i < step ? 'text-white' : 'text-subtle'
                }`}
              >
                {i + 1}. {label}
              </span>
              {i < STEPS.length - 1 && <span className="text-subtle">·</span>}
            </li>
          ))}
        </ol>

        {banner && (
          <div className="mb-6">
            <Alert tone="danger">{banner}</Alert>
          </div>
        )}

        {/* All five steps share ONE motion wrapper keyed on `step`. Changing
            the key remounts it, which replays the entrance — no per-step
            wiring, and nothing inside these branches changed. */}
        <motion.div key={step} {...stepMotion(reduced)}>

        {/* ── 1. Vehicle ───────────────────────────────────────────────────── */}
        {step === 0 && (
          <fieldset>
            <legend className="mb-4 font-display text-xl font-semibold text-white">
              Which vehicle?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {vehicles.map((v) => (
                <ChoiceCard
                  key={v.id}
                  multi={false}
                  selected={vehicleId === v.id}
                  onToggle={() => {
                    setVehicleId(v.id);
                    // Services are priced per size class, so a different
                    // vehicle invalidates the current selection entirely.
                    setServiceIds([]);
                    setAddOnIds([]);
                    setStartsAt('');
                  }}
                  title={vehicleLabel(v)}
                  subtitle={sizeLabel(v.sizeClass)}
                  meta={v.color || undefined}
                  image={v.photoUrl ?? undefined}
                />
              ))}
            </div>
            <Link href={addVehicleHref} className="mt-4 inline-block text-[13px] text-muted hover:text-white">
              + Add another vehicle
            </Link>
          </fieldset>
        )}

        {/* ── 2. Services ──────────────────────────────────────────────────── */}
        {step === 1 && vehicle && (
          <div className="space-y-8">
            <fieldset>
              <legend className="mb-4 font-display text-xl font-semibold text-white">
                What would you like done?
              </legend>
              <div className="grid gap-2">
                {services.map((s) => {
                  const price = priceFor(s, vehicle.sizeClass, overrides);
                  return (
                    <ChoiceCard
                      key={s.id}
                      selected={serviceIds.includes(s.id)}
                      onToggle={() =>
                        setServiceIds((prev) =>
                          prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                        )
                      }
                      title={s.name}
                      subtitle={s.shortDescription}
                      meta={`${price ? formatPrice(price.price, price.priceMax) : '—'} · ${formatHours(s.estimatedHours)}`}
                    />
                  );
                })}
              </div>
            </fieldset>

            {addOns.length > 0 && (
              <fieldset>
                <legend className="mb-4 font-display text-lg font-semibold text-white">
                  Add-ons
                </legend>
                <div className="grid gap-2">
                  {addOns.map((a) => {
                    const price = priceFor(a, vehicle.sizeClass, overrides);
                    return (
                      <ChoiceCard
                        key={a.id}
                        selected={addOnIds.includes(a.id)}
                        onToggle={() =>
                          setAddOnIds((prev) =>
                            prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]
                          )
                        }
                        title={a.name}
                        subtitle={a.description}
                        meta={price ? formatPrice(price.price, price.priceMax) : '—'}
                      />
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>
        )}

        {/* ── 3. Where ─────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <fieldset>
              <legend className="mb-4 font-display text-xl font-semibold text-white">
                Where should we work?
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChoiceCard
                  multi={false}
                  selected={locationType === 'mobile'}
                  onToggle={() => {
                    setLocationType('mobile');
                    setStartsAt('');
                  }}
                  title="Come to me"
                  subtitle="We bring water, power and everything else."
                />
                <ChoiceCard
                  multi={false}
                  selected={locationType === 'shop'}
                  onToggle={() => {
                    setLocationType('shop');
                    setStartsAt('');
                  }}
                  title="I will come to you"
                  subtitle="Drop off at our unit."
                />
              </div>
            </fieldset>

            {locationType === 'mobile' && (
              <InputField
                label="Address"
                value={address}
                onChange={setAddress}
                maxLength={200}
                required
                autoComplete="street-address"
                hint="Street, city, ZIP. Include a gate code or slip number if we will need one."
              />
            )}

            <TextAreaField
              label="Anything we should know?"
              value={notes}
              onChange={setNotes}
              rows={3}
              maxLength={2000}
              hint="Optional. Problem areas, pet hair, a dog in the yard — all useful."
            />
          </div>
        )}

        {/* ── 4. When ──────────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-display text-xl font-semibold text-white">Pick a time</h2>

            {/* The shimmer replaces the old "Checking the calendar…" line. Same
                `loadingSlots` state, same fetch — it just occupies the space the
                real calendar is about to take, so nothing below it moves when
                the response lands. The sr-only label is what a screen reader
                gets, since the skeleton itself is aria-hidden. */}
            {loadingSlots && (
              <div role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">Checking the calendar</span>
                <SlotsSkeleton />
              </div>
            )}
            {slotError && <Alert tone="danger">{slotError}</Alert>}

            {!loadingSlots && !slotError && (
              <>
                {/* Days */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {days.map((d) => {
                    const date = new Date(`${d.dateIso}T12:00:00Z`);
                    const open = d.openCount > 0;
                    return (
                      <button
                        key={d.dateIso}
                        type="button"
                        disabled={!open}
                        onClick={() => {
                          setDateIso(d.dateIso);
                          setStartsAt('');
                        }}
                        aria-pressed={dateIso === d.dateIso}
                        // `.lift` only on days that can actually be chosen — a
                        // closed day that rises under the cursor promises
                        // something it will not deliver. The disabled branch
                        // keeps `cursor-not-allowed` and no elevation.
                        className={`flex min-w-[64px] shrink-0 flex-col items-center rounded-sm border px-3 py-2.5 transition-colors duration-200 ${
                          dateIso === d.dateIso
                            ? 'lift border-apex bg-apex/10 shadow-[0_0_0_1px_rgba(212,0,26,0.35)]'
                            : open
                              ? 'lift border-white/20 hover:border-white/50 hover:bg-white/5'
                              : 'cursor-not-allowed border-white/5 opacity-35'
                        }`}
                      >
                        <span className="font-mono text-[10px] uppercase tracking-wider text-subtle">
                          {date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                        </span>
                        <span className="mt-0.5 text-base text-white">
                          {date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}
                        </span>
                        <span className="mt-0.5 font-mono text-[9px] text-subtle">
                          {open ? `${d.openCount} free` : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Times, grouped by part of day — a 7am and a 6pm slot are very
                    different propositions and should not sit in one flat list. */}
                {selectedDay && (
                  <div className="space-y-5">
                    {(['morning', 'afternoon', 'evening'] as const).map((period) => {
                      const slots = selectedDay.slots.filter(
                        (s) => s.period === period && s.available
                      );
                      if (!slots.length) return null;
                      return (
                        <div key={period}>
                          <p className="eyebrow mb-2 capitalize">{period}</p>
                          <div className="flex flex-wrap gap-2">
                            {slots.map((s) => (
                              <button
                                key={s.startsAt}
                                type="button"
                                onClick={() => setStartsAt(s.startsAt)}
                                aria-pressed={startsAt === s.startsAt}
                                // 200ms on colour and a 1px apex ring on the
                                // chosen slot. Selection feedback has to be
                                // instant — this is the tap the whole screen
                                // exists for.
                                className={`rounded-sm border px-4 py-2 font-mono text-[13px] transition-all duration-200 ${
                                  startsAt === s.startsAt
                                    ? 'border-apex bg-apex/15 text-white shadow-[0_0_0_1px_rgba(212,0,26,0.35)]'
                                    : 'border-white/20 text-muted hover:-translate-y-px hover:border-white/50 hover:bg-white/5 hover:text-white'
                                }`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {selectedDay.openCount === 0 && (
                      <Alert tone="info">
                        {selectedDay.closedReason ??
                          'Nothing free that day. Try another, or call us — we can often fit work in.'}
                      </Alert>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 5. Confirm ─────────────────────────────────────────────────────
            The one moment in this flow that is allowed to be celebratory. The
            customer has answered four screens of questions and is about to
            commit; the summary should feel like a ticket, not a receipt.

            What that costs: a `gradient-border` ring, a `light-sweep` gloss
            pass, and ten motes — all CSS already in the stylesheet, all
            `pointer-events-none`, all removed entirely by the global
            reduced-motion rule. Nothing here touches the estimate, the payload,
            or the 409 recovery path.

            What it does NOT do: obscure a single figure. Every value in the
            summary sits above the decoration at full contrast, because this is
            also the last chance to notice a wrong address. */}
        {step === 4 && vehicle && (
          <div className="relative space-y-5">
            <div className="pointer-events-none absolute inset-0 -z-10 isolate" aria-hidden="true">
              <Motes kind="dust" count={10} />
            </div>

            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-apex/50 bg-apex/15 text-flare"
                aria-hidden="true"
              >
                <svg width="14" height="11" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.2 5.8L8 1" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              <h2 className="text-gradient font-display text-xl font-semibold">Check and confirm</h2>
            </div>

            <Card className="gradient-border light-sweep relative overflow-hidden">
              <dl className="relative text-sm">
                <Row label="Vehicle">{vehicleLabel(vehicle)}</Row>
                <Row label="When">
                  {startsAt
                    ? new Date(startsAt).toLocaleString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—'}
                </Row>
                <Row label="Where">
                  {locationType === 'mobile' ? address : 'Our shop'}
                </Row>
                <Row label="Services">
                  {serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(', ')}
                </Row>
                {addOnIds.length > 0 && (
                  <Row label="Add-ons">
                    {addOnIds.map((id) => addOns.find((a) => a.id === id)?.name).filter(Boolean).join(', ')}
                  </Row>
                )}
                {notes && <Row label="Notes">{notes}</Row>}
              </dl>
            </Card>

            {estimate?.isPlaceholderPricing && (
              <Alert tone="warning" title="Indicative price">
                Pricing for this industry has not been finalised. We will confirm the figure with
                you before any work starts.
              </Alert>
            )}

            <p className="text-[13px] leading-relaxed text-muted">
              This books the slot. Final pricing is confirmed after an in-person inspection — if the
              condition differs from what we expect, we tell you before we start, not after.
            </p>
          </div>
        )}

        </motion.div>

        {/* ── Navigation ───────────────────────────────────────────────────── */}
        <div className="mt-10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className={buttonClass('ghost')}
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              className={buttonClass('primary')}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !startsAt}
              className={buttonClass('primary')}
            >
              {submitting ? 'Booking…' : 'Confirm booking'}
            </button>
          )}
        </div>
      </div>

      {/* ── Running summary ────────────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <p className="eyebrow mb-4">Your estimate</p>

          {!estimate ? (
            <p className="text-sm text-muted">Choose a service to see pricing.</p>
          ) : (
            <>
              <ul className="space-y-2 text-sm">
                {estimate.lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span className={l.kind === 'addon' ? 'text-muted' : 'text-white'}>
                      {l.kind === 'addon' ? '+ ' : ''}
                      {l.label}
                    </span>
                    <span className="shrink-0 font-mono text-muted">
                      {formatPrice(l.price, l.priceMax)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-white">Estimated total</span>
                  <span className="font-display text-xl font-bold text-white">
                    {formatPrice(estimate.total, estimate.totalMax)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-subtle">
                  About {formatHours(estimate.estimatedHours)}
                </p>
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-subtle">
                Any membership discount or reward coupon you have is applied when the booking is
                created — the figure on your confirmation may be lower than this.
              </p>
            </>
          )}
        </Card>
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-2.5 last:border-0">
      <dt className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">{label}</dt>
      <dd className="max-w-[65%] text-right text-white">{children}</dd>
    </div>
  );
}

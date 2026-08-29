// ─────────────────────────────────────────────────────────────────────────────
// /app/assistant — the detailing advisor.
//
// ⚠️ THIS PAGE COSTS NOTHING TO RUN, AND THAT IS THE POINT.
//
// It replaced an LLM-backed chat (Claude over the Messages API) that billed per
// message on a public endpoint. The owner asked for the customer value — "answer
// basic questions, suggest services" — WITHOUT the per-use cost, so both halves
// are now served from data the app already holds:
//
//   • Suggestions come from lib/recommendations.ts — deterministic, keyed to the
//     customer's own vehicle and history against the real price tables.
//   • Answers come from data/faq.ts — curated, rendered with native
//     <details>/<summary>, which ships zero JavaScript and makes zero API calls.
//
// A server component, so the whole thing is HTML on first paint and works from
// the service worker's cache offline. If a question isn't covered, the page
// routes the customer to a real person — never to a paid model.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePage } from '@/lib/guards';
import { listVehicles } from '@/lib/repo/vehicles';
import { listAppointments } from '@/lib/repo/appointments';
import { recommendServices } from '@/lib/recommendations';
import { availableServices } from '@/lib/pricing';
import { formatPrice, startingPrice } from '@/lib/pricing';
import { vehicleLabel } from '@/lib/models';
import { business } from '@/lib/business';
import { faqForIndustry } from '@/data/faq';
import { PageHeader, Card, LinkButton, buttonClass } from '@/components/ui';
import Reveal from '@/components/visual/Reveal';
import Backdrop from '@/components/visual/Backdrop';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Advice',
  robots: { index: false, follow: false },
};

export default async function AdvisorPage() {
  const user = await requirePage('/app/assistant');

  const vehicles = listVehicles(user.id);
  const defaultVehicle = vehicles.find((v) => v.isDefault) ?? vehicles[0];

  const past = defaultVehicle
    ? listAppointments({ customerId: user.id, direction: 'past', limit: 20 })
    : [];

  // Tailored suggestions when we know the vehicle; otherwise the cheapest few
  // automotive services as a neutral starting point (labelled "popular", never
  // "recommended for you", because we cannot personalise without a vehicle).
  const recommended = defaultVehicle ? recommendServices(defaultVehicle, past, 3) : [];
  const popular = defaultVehicle
    ? []
    : availableServices('automotive', null)
        .slice()
        .sort((a, b) => startingPrice(a) - startingPrice(b))
        .slice(0, 3);

  const faq = faqForIndustry(defaultVehicle?.industry);

  return (
    <div className="relative space-y-8">
      <div
        className="pointer-events-none absolute -inset-x-4 -top-6 bottom-0 -z-10 isolate sm:-inset-x-6"
        aria-hidden="true"
      >
        <Backdrop industry={defaultVehicle?.industry} photo={false} intensity="subtle" />
      </div>

      <PageHeader
        eyebrow="Detailing advice"
        title="What can we help with?"
        description="Straight answers from our own service list, and suggestions based on what your vehicle actually needs. Anything we don't cover here, a real person will."
      />

      {/* ── Suggestions ────────────────────────────────────────────────────── */}
      <Reveal>
        <section aria-labelledby="suggest-heading">
          <h2 id="suggest-heading" className="eyebrow mb-3">
            {defaultVehicle
              ? `Suggested for your ${vehicleLabel(defaultVehicle)}`
              : 'Popular places to start'}
          </h2>

          {defaultVehicle && recommended.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                You&rsquo;re on top of it — nothing outstanding for your{' '}
                {vehicleLabel(defaultVehicle)} right now. When it&rsquo;s due for maintenance
                again we&rsquo;ll flag it on your home screen.
              </p>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-3">
              {(defaultVehicle ? recommended : popular).map((s) => {
                const price = defaultVehicle
                  ? s.prices[defaultVehicle.sizeClass]
                  : undefined;
                const priceLabel = price
                  ? formatPrice(price.price, price.priceMax)
                  : `From ${formatPrice(startingPrice(s))}`;
                const bookHref = defaultVehicle
                  ? `/app/book?vehicle=${defaultVehicle.id}&service=${s.id}`
                  : `/app/book?service=${s.id}`;
                return (
                  <Card as="li" key={s.id} className="lift sweep-hover flex flex-col">
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">
                      {s.shortDescription}
                    </p>
                    <p className="mt-3 font-mono text-sm text-white">{priceLabel}</p>
                    <Link href={bookHref} className={buttonClass('secondary', 'sm', 'mt-3 w-full')}>
                      Book this
                    </Link>
                  </Card>
                );
              })}
            </ul>
          )}

          {!defaultVehicle && (
            <p className="mt-3 text-[13px] text-muted">
              <Link href="/app/garage/new" className="text-flare hover:underline">
                Add your vehicle
              </Link>{' '}
              and these suggestions become tailored to it — right size, right services, real
              prices.
            </p>
          )}
        </section>
      </Reveal>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <Reveal delay={80}>
        <section aria-labelledby="faq-heading" className="space-y-6">
          <h2 id="faq-heading" className="eyebrow">
            Common questions
          </h2>

          {faq.map((group) => (
            <div key={group.id}>
              <h3 className="mb-2 text-sm font-medium text-white">{group.title}</h3>
              <div className="divide-y divide-white/10 overflow-hidden rounded-md border border-white/10 bg-obsidian/40">
                {group.items.map((item) => (
                  // Native disclosure — accessible, keyboard-operable, and zero JS.
                  <details key={item.q} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm text-white transition-colors hover:bg-white/5 [&::-webkit-details-marker]:hidden">
                      <span>{item.q}</span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="shrink-0 text-subtle transition-transform duration-200 group-open:rotate-180"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </summary>
                    <p className="px-4 pb-4 text-[13px] leading-relaxed text-muted">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </section>
      </Reveal>

      {/* ── Escape hatch to a human ─────────────────────────────────────────── */}
      <Reveal delay={160}>
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Didn&rsquo;t find your answer?</p>
            <p className="mt-1 text-[13px] text-muted">
              Call or text us on{' '}
              <a href={business.phoneHref} className="text-flare hover:underline">
                {business.phone}
              </a>{' '}
              — a real person, not a bot.
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <a href={business.phoneHref} className={buttonClass('secondary', 'sm')}>
              Call
            </a>
            <LinkButton href="/app/book">Book a service</LinkButton>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}

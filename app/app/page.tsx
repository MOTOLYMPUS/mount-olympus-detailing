// ─────────────────────────────────────────────────────────────────────────────
// Customer dashboard — the app's home screen.
//
// A server component that reads straight from the repositories. There is no
// /api round trip and no client-side fetching, so the first paint already has
// real data and works from the service worker's cached HTML when offline.
//
// IT IS STILL A SERVER COMPONENT AFTER THE VISUAL PASS. <Reveal> and <Counter>
// are individually client components, but importing a client component into a
// server tree does not convert the tree — only the leaves ship JavaScript. That
// is why there is no 'use client' at the top of this file and why the whole
// dashboard is still rendered as HTML on the server.
//
// The decoration budget here is deliberately small. This screen is opened
// several times a day, so it gets: a `subtle` Backdrop keyed to the customer's
// own vehicle, `.lift` on the cards that are actually clickable, one short
// staggered reveal per section, and counters on the two numbers that represent
// progress. No motes, no parallax, no light sweep — those belong on the auth
// screen, which is seen once.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { requirePage, homeFor } from '@/lib/guards';
import { redirect } from 'next/navigation';
import { isStaff } from '@/lib/rbac';
import { listAppointments } from '@/lib/repo/appointments';
import { listVehicles } from '@/lib/repo/vehicles';
import { ensureLoyaltyAccount, activeMembership } from '@/lib/repo/loyalty';
import { listPhotosForCustomer } from '@/lib/repo/jobs';
import { listEstimateRequestsByEmail } from '@/lib/db';
import { listInvoices } from '@/lib/repo/payments';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { buildReminders, recommendServices } from '@/lib/recommendations';
import { formatCurrency, formatPrice } from '@/lib/pricing';
import { formatDateTime, relativeTime } from '@/lib/timezone';
import { getService } from '@/data/pricing';
import { TIER_DISCOUNT, TIER_THRESHOLDS, vehicleLabel } from '@/lib/models';
import {
  Alert,
  Badge,
  Card,
  CardTitle,
  EmptyState,
  LinkButton,
  StatusBadge,
  buttonClass,
} from '@/components/ui';
import Reveal from '@/components/visual/Reveal';
import Backdrop from '@/components/visual/Backdrop';
import { Counter } from '@/components/visual/Effects';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const user = requirePage('/app');

  // Staff landing on /app get their own home rather than a customer dashboard
  // that would be empty for them.
  if (isStaff(user.role)) redirect(homeFor(user.role));

  const tz = getSchedulingConfig().timezone;

  const vehicles = listVehicles(user.id);
  const upcoming = listAppointments({
    customerId: user.id,
    direction: 'upcoming',
    statuses: ['scheduled', 'confirmed', 'in_progress'],
    limit: 5,
  });
  const past = listAppointments({ customerId: user.id, direction: 'past', limit: 20 });
  const loyalty = ensureLoyaltyAccount(user.id);
  const membership = activeMembership(user.id);
  const photos = listPhotosForCustomer(user.id, 8);
  const estimates = listEstimateRequestsByEmail(user.email, 5);
  const invoices = listInvoices({ userId: user.id, limit: 5 });

  const reminders = buildReminders(vehicles, [...upcoming, ...past]);
  const defaultVehicle = vehicles.find((v) => v.isDefault) ?? vehicles[0];
  const recommended = defaultVehicle ? recommendServices(defaultVehicle, past) : [];

  const nextTier = (['silver', 'gold', 'platinum'] as const).find(
    (t) => TIER_THRESHOLDS[t] > loyalty.lifetimePoints
  );

  return (
    <div className="relative space-y-8">
      {/* Keyed to the customer's own vehicle, so someone who keeps a boat here
          gets the water-ripple texture and someone with a car gets carbon
          fibre. `photo={false}`: Backdrop's photo layer is a lazily-loaded
          next/image, and this screen is opened several times a day — a
          decorative request on every one of those visits is not worth 5%
          opacity. The texture and mesh are CSS already in the stylesheet.
          Bleeds past the <main> padding so it reads as a page backdrop rather
          than a panel. */}
      <div
        className="pointer-events-none absolute -inset-x-4 -top-6 bottom-0 -z-10 isolate sm:-inset-x-6"
        aria-hidden="true"
      >
        <Backdrop industry={defaultVehicle?.industry} photo={false} intensity="subtle" />
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Your account</p>
          <h1 className="font-display text-2xl font-bold tracking-tightest text-white sm:text-3xl">
            {greeting()}, {user.name.split(' ')[0]}.
          </h1>
        </div>
        <LinkButton href="/app/book">Book a service</LinkButton>
      </header>

      {/* ── Next appointment ─────────────────────────────────────────────────
          <Reveal> wraps the <section> rather than replacing it: it takes no
          arbitrary DOM props, and the landmark's `aria-labelledby` link to its
          heading is not something to lose for an animation. */}
      <Reveal>
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="sr-only">
          Upcoming appointments
        </h2>

        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing booked yet"
            description="Pick a service, choose a time that suits you, and we will come to you."
            action={<LinkButton href="/app/book">Book a service</LinkButton>}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((a) => (
              // `.lift` and `.sweep-hover` only on cards that lead somewhere.
              // A card that rises under the cursor but is not clickable is a
              // lie about what happens if you click it.
              <Card as="li" key={a.id} className="lift sweep-hover">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold text-white">
                      {formatDateTime(a.startsAt, tz)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-subtle">{relativeTime(a.startsAt)}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>

                <dl className="text-sm">
                  <div className="flex justify-between gap-3 py-1">
                    <dt className="text-subtle">Services</dt>
                    <dd className="text-right text-white">
                      {a.serviceIds.map((id) => getService(id)?.name ?? id).join(', ')}
                    </dd>
                  </div>
                  {a.vehicleLabel && (
                    <div className="flex justify-between gap-3 py-1">
                      <dt className="text-subtle">Vehicle</dt>
                      <dd className="text-white">{a.vehicleLabel}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 py-1">
                    <dt className="text-subtle">Estimated</dt>
                    <dd className="font-mono text-white">
                      {formatPrice(a.quotedTotal, a.quotedTotalMax)}
                    </dd>
                  </div>
                </dl>

                <Link
                  href={`/app/appointments/${a.id}`}
                  className={buttonClass('secondary', 'sm', 'mt-4 w-full')}
                >
                  Manage booking
                </Link>
              </Card>
            ))}
          </ul>
        )}
      </section>
      </Reveal>

      {/* ── Reminders ──────────────────────────────────────────────────────── */}
      {reminders.length > 0 && (
        <Reveal delay={60}>
        <section aria-labelledby="reminders-heading">
          <h2 id="reminders-heading" className="eyebrow mb-3">
            Maintenance reminders
          </h2>
          <ul className="space-y-3">
            {reminders.map((r) => (
              <Card
                as="li"
                key={r.id}
                className="lift flex flex-wrap items-center justify-between gap-4"
              >
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-medium text-white">{r.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{r.detail}</p>
                </div>
                <Link href={r.href} className={buttonClass('secondary', 'sm')}>
                  {r.kind === 'first-visit' ? 'Get started' : 'Book it'}
                </Link>
              </Card>
            ))}
          </ul>
        </section>
        </Reveal>
      )}

      <Reveal delay={120}>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Loyalty ──────────────────────────────────────────────────────── */}
        <Card className="lift">
          <CardTitle
            action={
              <Link href="/app/rewards" className="text-[12px] text-muted hover:text-white">
                View all
              </Link>
            }
          >
            Loyalty
          </CardTitle>

          <div className="flex items-baseline gap-3">
            {/* <Counter> renders the FINAL value in the server HTML and only
                animates after mount, so the real balance is present with no JS
                and for a screen reader on first paint. 900ms rather than the
                1600ms default: this is a dashboard, not a landing page — the
                number needs to be readable by the time the eye reaches it. */}
            <p className="font-display text-3xl font-bold tracking-tightest text-white">
              <Counter to={loyalty.points} duration={900} />
            </p>
            <span className="text-sm text-muted">points</span>
            <Badge tone="info">{loyalty.tier}</Badge>
          </div>

          {TIER_DISCOUNT[loyalty.tier] > 0 && (
            <p className="mt-2 text-[13px] text-emerald-400">
              {TIER_DISCOUNT[loyalty.tier]}% off every booking at this tier.
            </p>
          )}

          {nextTier && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[12px] text-subtle">
                <span>Progress to {nextTier}</span>
                <span className="font-mono">
                  <Counter to={loyalty.lifetimePoints} duration={900} /> /{' '}
                  {TIER_THRESHOLDS[nextTier]}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                {/* The bar keeps a plain inline width — a CSS transition on it
                    would animate `width`, which relayouts on every frame. The
                    counter above already carries the sense of progress. */}
                <div
                  className="h-full rounded-full bg-apex"
                  style={{
                    width: `${Math.min(100, (loyalty.lifetimePoints / TIER_THRESHOLDS[nextTier]) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {membership && (
            <p className="mt-4 border-t border-white/10 pt-3 text-[13px] text-muted">
              Member: <span className="text-white">{membership.plan.name}</span> ·{' '}
              {membership.plan.discountPct}% off
            </p>
          )}
        </Card>

        {/* ── Garage ───────────────────────────────────────────────────────── */}
        <Card className="lift">
          <CardTitle
            action={
              <Link href="/app/garage" className="text-[12px] text-muted hover:text-white">
                Manage
              </Link>
            }
          >
            Your garage
          </CardTitle>

          {vehicles.length === 0 ? (
            <p className="py-4 text-sm text-muted">
              No vehicles saved yet.{' '}
              <Link href="/app/garage/new" className="text-flare hover:underline">
                Add one
              </Link>{' '}
              and booking gets much faster.
            </p>
          ) : (
            <ul className="space-y-2">
              {vehicles.slice(0, 4).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{vehicleLabel(v)}</p>
                    <p className="text-[12px] text-subtle">
                      {v.color ? `${v.color} · ` : ''}
                      {v.vehicleType}
                    </p>
                  </div>
                  {v.isDefault && <Badge>Default</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      </Reveal>

      {/* ── Recommended ────────────────────────────────────────────────────── */}
      {recommended.length > 0 && defaultVehicle && (
        <Reveal delay={180}>
        <section aria-labelledby="recommended-heading">
          <h2 id="recommended-heading" className="eyebrow mb-3">
            Recommended for your {vehicleLabel(defaultVehicle)}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {recommended.map((s) => {
              const price = s.prices[defaultVehicle.sizeClass];
              return (
                <Card as="li" key={s.id} className="lift sweep-hover">
                  <p className="text-sm font-medium text-white">{s.name}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                    {s.shortDescription}
                  </p>
                  <p className="mt-3 font-mono text-sm text-white">
                    {price ? formatPrice(price.price, price.priceMax) : '—'}
                  </p>
                  <Link
                    href={`/app/book?vehicle=${defaultVehicle.id}&service=${s.id}`}
                    className={buttonClass('secondary', 'sm', 'mt-3 w-full')}
                  >
                    Book this
                  </Link>
                </Card>
              );
            })}
          </ul>
        </section>
        </Reveal>
      )}

      {/* ── Photos ─────────────────────────────────────────────────────────── */}
      {photos.length > 0 && (
        <Reveal delay={240}>
        <section aria-labelledby="photos-heading">
          <h2 id="photos-heading" className="eyebrow mb-3">
            Your before &amp; after
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              <li
                key={p.id}
                className="lift relative overflow-hidden rounded-sm border border-white/10"
              >
                {/* A plain <img>: these are user uploads served from
                    /api/files, which next/image cannot optimise without a
                    loader, and they are already phone-sized. */}
                {/* `.img-reveal` is a clip-path wipe over the ALREADY DECODED
                    image, driven by the `data-revealed` the <Reveal> above sets
                    on its subtree — so it never shows a flash of empty box and
                    cannot shift layout. `aspect-square` reserves the space
                    regardless. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption || `${p.kind} photo`}
                  loading="lazy"
                  className="img-reveal aspect-square w-full object-cover"
                />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-obsidian/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white">
                  {p.kind}
                </span>
              </li>
            ))}
          </ul>
        </section>
        </Reveal>
      )}

      <Reveal delay={300}>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Estimates ────────────────────────────────────────────────────── */}
        <Card className="lift">
          <CardTitle>Your quotes</CardTitle>
          {estimates.length === 0 ? (
            <p className="py-3 text-sm text-muted">No quotes yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {estimates.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {e.year} {e.make} {e.model}
                    </p>
                    <p className="font-mono text-[12px] text-subtle">{e.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-white">
                      {formatPrice(e.quotedTotal, e.quotedTotalMax)}
                    </p>
                    <StatusBadge status={e.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Invoices ─────────────────────────────────────────────────────── */}
        <Card className="lift">
          <CardTitle
            action={
              <Link href="/app/payments" className="text-[12px] text-muted hover:text-white">
                All payments
              </Link>
            }
          >
            Invoices
          </CardTitle>
          {invoices.length === 0 ? (
            <p className="py-3 text-sm text-muted">No invoices yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="font-mono text-[13px] text-white">{inv.number}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-white">
                      {formatCurrency(inv.totalCents / 100)}
                    </span>
                    <StatusBadge status={inv.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      </Reveal>

      {/* Service history stays PLAIN — no reveal, no lift. It is a dense list
          the customer scans for a specific past job, and animating rows in a
          list you are reading is the definition of getting in the way. */}
      {past.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="eyebrow mb-3">
            Service history
          </h2>
          <ul className="divide-y divide-white/5 rounded-sm border border-white/10">
            {past.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/app/appointments/${a.id}`} className="text-sm text-white hover:text-flare">
                    {a.serviceIds.map((id) => getService(id)?.name ?? id).join(', ')}
                  </Link>
                  <p className="text-[12px] text-subtle">
                    {formatDateTime(a.startsAt, tz)}
                    {a.vehicleLabel ? ` · ${a.vehicleLabel}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-[13px] text-muted">
                    {formatCurrency(a.quotedTotal)}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!user.smsConsent && (
        <Alert tone="info" title="Want appointment reminders by text?">
          Turn on SMS in{' '}
          <Link href="/app/profile" className="underline">
            your profile
          </Link>
          . We only use it for booking confirmations and reminders.
        </Alert>
      )}
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

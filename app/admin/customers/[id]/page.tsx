// ─────────────────────────────────────────────────────────────────────────────
// /admin/customers/:id — one customer, everything about them.
//
// A CUSTOMER-ONLY screen. The id is checked to belong to someone with the
// 'customer' role before anything is rendered: without that check this page is
// a viewer for any user record in the system, including staff — hourly rates,
// private notes and all — for anyone who can reach /admin.
//
// Read-only by design. Editing a customer's profile from here would need its
// own audited endpoint; the actions that matter (their bookings) each have a
// detail screen that already owns them.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  Field,
  LinkButton,
  PageHeader,
  StatTile,
  StatusBadge,
} from '@/components/ui';
import { telHref } from '@/components/staff/JobCard';
import { requireRolePage } from '@/lib/guards';
import { getUser } from '@/lib/repo/users';
import { listAppointments } from '@/lib/repo/appointments';
import { listVehicles } from '@/lib/repo/vehicles';
import { listInvoices, listPayments } from '@/lib/repo/payments';
import { activeMembership, getLoyaltyAccount, listLoyaltyEvents } from '@/lib/repo/loyalty';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { listEstimateRequestsByEmail } from '@/lib/db';
import { vehicleLabel } from '@/lib/models';
import { VehicleThumb } from '@/components/garage/VehiclePhoto';
import CustomerVehicleActions from '@/components/admin/CustomerVehicleActions';
import { formatDate, formatDateTime, relativeTime } from '@/lib/timezone';
import { formatCurrency } from '@/lib/pricing';
import { getService } from '@/data/pricing';
import { sizeLabel } from '@/lib/industries';

export const dynamic = 'force-dynamic';

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRolePage('manager', `/admin/customers/${(await params).id}`);
  const { timezone } = getSchedulingConfig();

  const customer = getUser((await params).id);
  // Staff records are managed on /admin/employees, which enforces the rank
  // rules. Serving one here would route around them.
  if (!customer || customer.role !== 'customer') notFound();

  const appointments = listAppointments({ customerId: customer.id, direction: 'all', limit: 500 })
    .slice()
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const completed = appointments.filter((a) => a.status === 'completed');
  const lifetime = completed.reduce((sum, a) => sum + a.quotedTotal, 0);

  // Removed vehicles stay in this list, restorable, for 24 hours after removal
  // and then drop out. They leave the customer's own garage immediately; the
  // rows are kept for booking history either way.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const vehicles = listVehicles(customer.id, true).filter(
    (v) => !v.archived || (v.archivedAt ? Date.parse(v.archivedAt) > cutoff : false)
  );
  const invoices = listInvoices({ userId: customer.id, limit: 50 });
  const payments = listPayments({ userId: customer.id, limit: 50 });
  const loyalty = getLoyaltyAccount(customer.id);
  const loyaltyEvents = listLoyaltyEvents(customer.id, 25);
  const membership = activeMembership(customer.id);
  const estimates = listEstimateRequestsByEmail(customer.email, 20);

  return (
    <>
      <PageHeader
        eyebrow="Customer"
        title={customer.name}
        description={`Joined ${formatDate(customer.createdAt, timezone)} · ${relativeTime(customer.createdAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/admin/customers/${customer.id}/book`} size="sm">
              Book for customer
            </LinkButton>
            <LinkButton href={`/admin/customers/${customer.id}/vehicles/new`} variant="secondary" size="sm">
              Add vehicle
            </LinkButton>
            <LinkButton href="/admin/customers" variant="ghost" size="sm">
              ← Customers
            </LinkButton>
          </div>
        }
      />

      <section aria-label="Summary" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Lifetime spend" value={formatCurrency(lifetime)} sub="Completed jobs" />
        <StatTile label="Jobs" value={String(completed.length)} sub={`${appointments.length} booked`} />
        <StatTile
          label="Loyalty"
          value={String(loyalty?.points ?? 0)}
          sub={loyalty ? `${loyalty.tier} · ${loyalty.lifetimePoints} lifetime` : 'No account'}
        />
        <StatTile
          label="Membership"
          value={membership ? membership.plan.name : 'None'}
          sub={membership ? `${membership.plan.discountPct}% off` : 'Not subscribed'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {/* ── History ── */}
          <Card>
            <CardTitle
              action={<span className="font-mono text-[11px] text-muted">{appointments.length}</span>}
            >
              Appointment history
            </CardTitle>

            {appointments.length === 0 ? (
              <EmptyState
                title="No bookings yet"
                description="This customer has an account but has never booked. Their estimate requests, if any, are listed below."
              />
            ) : (
              <ul className="space-y-2">
                {appointments.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/admin/appointments/${a.id}`}
                        className="block truncate text-sm text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                      >
                        {formatDateTime(a.startsAt, timezone)}
                      </Link>
                      <p className="truncate text-[12px] text-subtle">
                        {a.serviceIds.map((id) => getService(id)?.name ?? id).join(', ') || a.reference}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[12px] text-muted">
                        {formatCurrency(a.quotedTotal)}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── Vehicles ── */}
          <Card>
            <CardTitle>Garage</CardTitle>
            {vehicles.length === 0 ? (
              <p className="py-3 text-[13px] text-subtle">No vehicles saved.</p>
            ) : (
              <ul className="space-y-2">
                {vehicles.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-2.5 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <VehicleThumb src={v.photoUrl} alt={vehicleLabel(v)} />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{vehicleLabel(v)}</p>
                        <p className="text-[12px] text-subtle">
                          {[v.color, v.plate, v.vin].filter(Boolean).join(' · ') || 'No identifiers'}
                        </p>
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                      <div className="flex shrink-0 gap-1.5">
                        <Badge>{sizeLabel(v.sizeClass)}</Badge>
                        {v.isDefault && <Badge tone="positive">Default</Badge>}
                        {v.archived && (
                          <Badge tone="danger">
                            Removed · gone in{' '}
                            {Math.max(
                              1,
                              Math.ceil((Date.parse(v.archivedAt ?? v.updatedAt) + 24 * 60 * 60 * 1000 - Date.now()) / 3_600_000)
                            )}
                            h
                          </Badge>
                        )}
                      </div>
                      <CustomerVehicleActions id={v.id} label={vehicleLabel(v)} archived={v.archived} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── Estimates ── */}
          <Card>
            <CardTitle>Estimate requests</CardTitle>
            {estimates.length === 0 ? (
              <p className="py-3 text-[13px] text-subtle">
                No quote requests from this email address.
              </p>
            ) : (
              <ul className="space-y-2">
                {estimates.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">
                        {e.reference} · {[e.year, e.make, e.model].filter(Boolean).join(' ')}
                      </p>
                      <p className="text-[12px] text-subtle">
                        {formatDate(e.createdAt, timezone)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[12px] text-muted">
                        {formatCurrency(e.quotedTotal)}
                      </span>
                      <StatusBadge status={e.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ── Sidebar ── */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardTitle>Profile</CardTitle>
            <dl>
              <Field label="Email">
                <a
                  href={`mailto:${customer.email}`}
                  className="underline decoration-white/20 underline-offset-4 hover:text-flare"
                >
                  {customer.email}
                </a>
              </Field>
              <Field label="Phone">
                {customer.phone ? (
                  <a
                    href={telHref(customer.phone)}
                    className="font-mono underline decoration-white/20 underline-offset-4 hover:text-flare"
                  >
                    {customer.phone}
                  </a>
                ) : (
                  'Not provided'
                )}
              </Field>
              <Field label="SMS consent">{customer.smsConsent ? 'Given' : 'Not given'}</Field>
              <Field label="Address">{customer.address || 'Not provided'}</Field>
              <Field label="Account">{customer.active ? 'Active' : 'Deactivated'}</Field>
              <Field label="Last sign in">
                {customer.lastLoginAt ? relativeTime(customer.lastLoginAt) : 'Never'}
              </Field>
            </dl>
            {customer.notes && (
              <p className="mt-3 whitespace-pre-line rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] text-muted">
                {customer.notes}
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>Invoices</CardTitle>
            {invoices.length === 0 ? (
              <p className="py-3 text-[13px] text-subtle">None issued.</p>
            ) : (
              <ul className="space-y-1.5">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-mono text-muted">{inv.number}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-white">
                        {formatCurrency(inv.totalCents / 100)}
                      </span>
                      <StatusBadge status={inv.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {payments.length > 0 && (
              <>
                <p className="mb-2 mt-4 font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                  Payments
                </p>
                <ul className="space-y-1.5">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="text-muted">
                        {p.kind} · {formatDate(p.createdAt, timezone)}
                      </span>
                      <span className="font-mono text-white">
                        {formatCurrency(p.amountCents / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <CardTitle>Loyalty ledger</CardTitle>
            {!loyalty ? (
              <p className="py-3 text-[13px] text-subtle">No loyalty account yet.</p>
            ) : (
              <>
                <dl>
                  <Field label="Balance">{loyalty.points} pts</Field>
                  <Field label="Lifetime">{loyalty.lifetimePoints} pts</Field>
                  <Field label="Tier">
                    <Badge tone="info">{loyalty.tier}</Badge>
                  </Field>
                  <Field label="Referral code">
                    <span className="font-mono">{loyalty.referralCode}</span>
                  </Field>
                </dl>

                {loyaltyEvents.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                    {loyaltyEvents.map((e) => (
                      <li key={e.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate text-muted">{e.note || e.kind}</span>
                        <span
                          className={`shrink-0 font-mono ${e.points >= 0 ? 'text-emerald-400' : 'text-flare'}`}
                        >
                          {e.points >= 0 ? '+' : ''}
                          {e.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /admin/estimates — the quote request queue.
//
// This is where money is won or lost: an estimate that sits at "new" for three
// days is a customer who has already booked someone else. The default filter is
// therefore OPEN requests (new + contacted), sorted newest first, with the age
// of each one shown in plain words.
//
// The list comes from `listEstimateRequests()` in lib/db.ts, which has no
// status or paging arguments — so the recent window is fetched and filtered
// here. Fine at this volume; the note is in the report.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import clsx from 'clsx';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  StatTile,
  StatusBadge,
} from '@/components/ui';
import EstimateActions from '@/components/admin/EstimateActions';
import { requireRolePage } from '@/lib/guards';
import { listEstimateRequests } from '@/lib/db';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { getUserByEmail } from '@/lib/repo/users';
import { formatDate, relativeTime } from '@/lib/timezone';
import { formatCurrency, formatPrice } from '@/lib/pricing';
import { getService } from '@/data/pricing';
import { sizeLabel } from '@/lib/industries';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'open', label: 'Open', statuses: ['new', 'contacted'] },
  { key: 'new', label: 'New', statuses: ['new'] },
  { key: 'scheduled', label: 'Scheduled', statuses: ['scheduled'] },
  { key: 'closed', label: 'Closed', statuses: ['closed'] },
  { key: 'all', label: 'All', statuses: null as string[] | null },
];

export default async function AdminEstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  await requireRolePage('manager', '/admin/estimates');
  const { timezone } = getSchedulingConfig();
  const sp = (await searchParams) ?? {};

  const filter = FILTERS.find((f) => f.key === sp.status) ?? FILTERS[0];

  const all = listEstimateRequests(500);
  const estimates = filter.statuses ? all.filter((e) => filter.statuses!.includes(e.status)) : all;

  const open = all.filter((e) => e.status === 'new' || e.status === 'contacted');
  const scheduled = all.filter((e) => e.status === 'scheduled');
  const pipeline = open.reduce((sum, e) => sum + e.quotedTotal, 0);
  const conversion = all.length ? (scheduled.length / all.length) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Estimate requests"
        description="Quotes raised from the public site. Move each one along as you work it."
      />

      <section aria-label="Pipeline totals" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open" value={String(open.length)} sub="New or contacted" />
        <StatTile label="Open value" value={formatCurrency(pipeline)} sub="Quoted, not yet won" />
        <StatTile label="Scheduled" value={String(scheduled.length)} />
        <StatTile label="Conversion" value={`${conversion.toFixed(0)}%`} sub="Scheduled ÷ all" />
      </section>

      <nav aria-label="Filter" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'open' ? '/admin/estimates' : `/admin/estimates?status=${f.key}`}
            aria-current={f.key === filter.key ? 'page' : undefined}
            className={clsx(
              'rounded-full border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest2 transition-colors',
              f.key === filter.key
                ? 'border-apex bg-apex/10 text-white'
                : 'border-white/20 text-muted hover:border-white/50 hover:text-white'
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <Card>
        <CardTitle
          action={<span className="font-mono text-[11px] text-muted">{estimates.length}</span>}
        >
          {filter.label}
        </CardTitle>

        {estimates.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description="Requests from the public estimate calculator land in this queue the moment they are submitted."
          />
        ) : (
          <ul className="space-y-3">
            {estimates.map((e) => {
              // If this email already has an account, link straight to it — the
              // history is usually the answer to "should we discount this?".
              const account = getUserByEmail(e.email);

              // The booking flow accepts `service` as a hint and re-validates
              // everything server-side. There is no customer parameter because
              // there is no staff-side "book on behalf of" flow yet.
              const bookingHref = `/app/book?service=${encodeURIComponent(e.serviceIds[0] ?? '')}`;

              return (
                <li key={e.id} className="rounded-sm border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                        {e.reference} · {formatDate(e.createdAt, timezone)} · {relativeTime(e.createdAt)}
                      </p>
                      <p className="mt-1 font-display text-base font-semibold text-white">
                        {account ? (
                          <Link
                            href={`/admin/customers/${account.id}`}
                            className="underline decoration-white/20 underline-offset-4 hover:text-flare"
                          >
                            {e.name}
                          </Link>
                        ) : (
                          e.name
                        )}
                      </p>
                      <p className="text-[13px] text-muted">
                        {[e.year, e.make, e.model].filter(Boolean).join(' ')} ·{' '}
                        {sizeLabel(e.sizeClass)}
                      </p>
                      <p className="mt-1 text-[12px] text-subtle">
                        <a
                          href={`mailto:${e.email}`}
                          className="underline decoration-white/20 underline-offset-4 hover:text-white"
                        >
                          {e.email}
                        </a>
                        {e.phone && (
                          <>
                            {' · '}
                            <a
                              href={`tel:${e.phone.replace(/[^\d+]/g, '')}`}
                              className="font-mono underline decoration-white/20 underline-offset-4 hover:text-white"
                            >
                              {e.phone}
                            </a>
                          </>
                        )}
                        {e.smsConsent && <span className="ml-2 text-emerald-400">SMS ok</span>}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={e.status} />
                      <span className="font-mono text-[13px] text-white">
                        {formatPrice(e.quotedTotal, e.quotedTotalMax)}
                      </span>
                      {e.isPlaceholderPricing && (
                        <Badge tone="warning">Placeholder pricing</Badge>
                      )}
                      {e.preferredDate && (
                        <span className="font-mono text-[11px] text-subtle">
                          Wants {e.preferredDate}
                        </span>
                      )}
                    </div>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {e.serviceIds.map((id) => (
                      <li key={id}>
                        <Badge>{getService(id)?.name ?? id}</Badge>
                      </li>
                    ))}
                  </ul>

                  {e.notes && (
                    <p className="mt-3 whitespace-pre-line rounded-sm border border-white/10 px-3 py-2 text-[13px] leading-relaxed text-muted">
                      {e.notes}
                    </p>
                  )}

                  <div className="mt-3 border-t border-white/5 pt-3">
                    <EstimateActions estimateId={e.id} status={e.status} bookingHref={bookingHref} />
                    {!account && (
                      <p className="mt-2 text-[12px] leading-relaxed text-subtle">
                        No account matches {e.email}. Converting needs a customer record — call them,
                        or ask them to register with that address so their quote appears in their
                        dashboard.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

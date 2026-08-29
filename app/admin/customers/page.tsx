// ─────────────────────────────────────────────────────────────────────────────
// /admin/customers — searchable customer list with lifetime value.
//
// The search box is a GET form, so the query is in the URL and the whole page
// stays a server component. `listUsers({ search })` does the matching in SQL
// against name, email and phone.
//
// LIFETIME SPEND is computed from each customer's own appointment list rather
// than from a dedicated aggregate, because no such aggregate exists and adding
// one to lib/repo is outside this screen's remit. That makes the page N+1 —
// acceptable at the page size of 100 and honest about it, but the first thing
// to fix if this list ever gets long. See the note in the report.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Card, CardTitle, EmptyState, PageHeader, StatTile } from '@/components/ui';
import { requireRolePage } from '@/lib/guards';
import { listUsers } from '@/lib/repo/users';
import { listAppointments } from '@/lib/repo/appointments';
import { getLoyaltyAccount } from '@/lib/repo/loyalty';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { formatDate } from '@/lib/timezone';
import { formatCurrency } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; page?: string }>;
}) {
  await requireRolePage('manager', '/admin/customers');
  const { timezone } = getSchedulingConfig();

  const query = ((await searchParams)?.q ?? '').trim();
  const page = Math.max(0, Number((await searchParams)?.page) || 0);

  const customers = listUsers({
    roles: ['customer'],
    search: query || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = customers.map((customer) => {
    const appointments = listAppointments({ customerId: customer.id, direction: 'all', limit: 500 });
    const completed = appointments.filter((a) => a.status === 'completed');
    const lifetime = completed.reduce((sum, a) => sum + a.quotedTotal, 0);
    const last = appointments
      .slice()
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];

    return {
      customer,
      jobs: completed.length,
      booked: appointments.length,
      lifetime,
      lastVisit: last?.startsAt ?? null,
      loyalty: getLoyaltyAccount(customer.id),
    };
  });

  const totalLifetime = rows.reduce((sum, r) => sum + r.lifetime, 0);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Customers"
        description="Search by name, email or phone. Lifetime spend counts completed jobs only."
      />

      <section aria-label="Totals" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Shown" value={String(rows.length)} sub={query ? `Matching “${query}”` : 'All customers'} />
        <StatTile label="Lifetime value shown" value={formatCurrency(totalLifetime)} />
        <StatTile
          label="Average"
          value={formatCurrency(rows.length ? totalLifetime / rows.length : 0)}
          sub="Per customer shown"
        />
      </section>

      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
            <label htmlFor="q" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={query}
              placeholder="Name, email or phone"
              className="input-field"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="rounded-sm bg-apex px-5 py-2.5 text-sm font-medium text-white hover:bg-apex/90"
          >
            Search
          </button>
          {query && (
            <Link href="/admin/customers" className="px-3 py-2.5 text-sm text-muted hover:text-white">
              Clear
            </Link>
          )}
        </form>
      </Card>

      <Card>
        <CardTitle>{query ? `Results for “${query}”` : 'All customers'}</CardTitle>

        {rows.length === 0 ? (
          <EmptyState
            title={query ? 'No one matches that' : 'No customers yet'}
            description={
              query
                ? 'Try part of an email address, or a phone number without formatting.'
                : 'Customers appear here as soon as they register or are booked in.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  <th scope="col" className="py-2 pr-3 font-normal">Customer</th>
                  <th scope="col" className="py-2 pr-3 font-normal">Contact</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Jobs</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Lifetime</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Points</th>
                  <th scope="col" className="py-2 text-right font-normal">Last visit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.customer.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/admin/customers/${row.customer.id}`}
                        className="text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                      >
                        {row.customer.name}
                      </Link>
                      {!row.customer.active && (
                        <span className="ml-2 font-mono text-[10px] uppercase text-flare">inactive</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-muted">
                      <span className="block truncate">{row.customer.email}</span>
                      {row.customer.phone && (
                        <span className="block font-mono text-subtle">{row.customer.phone}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-muted">
                      {row.jobs}
                      {row.booked > row.jobs && (
                        <span className="text-subtle"> / {row.booked}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-white">
                      {formatCurrency(row.lifetime)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-muted">
                      {row.loyalty?.points ?? 0}
                    </td>
                    <td className="py-2.5 text-right text-[12px] text-muted">
                      {row.lastVisit ? formatDate(row.lastVisit, timezone) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Simple offset paging: only rendered when a full page came back, so
            there is no count query just to decide whether to show a link. */}
        <div className="mt-4 flex justify-between">
          {page > 0 ? (
            <Link
              href={`/admin/customers?${new URLSearchParams({ q: query, page: String(page - 1) })}`}
              className="text-[13px] text-muted hover:text-white"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {rows.length === PAGE_SIZE && (
            <Link
              href={`/admin/customers?${new URLSearchParams({ q: query, page: String(page + 1) })}`}
              className="text-[13px] text-muted hover:text-white"
            >
              Next →
            </Link>
          )}
        </div>
      </Card>
    </>
  );
}

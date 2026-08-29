// ─────────────────────────────────────────────────────────────────────────────
// /admin — the business dashboard.
//
// Entirely a SERVER component. Every figure is an aggregate that already exists
// in lib/repo/*, the charts are the CSS-only BarChart/ColumnChart from the UI
// kit, and the ?period= selector is a set of links — so the whole screen ships
// zero JavaScript and renders in one pass with no loading spinners.
//
// TRENDS COMPARE LIKE WITH LIKE. Each headline tile is measured against the
// immediately preceding window of the SAME LENGTH (lib/periods.ts), not against
// "last month". A 3% drop that is really February having 28 days is not a
// business signal, and a dashboard that reports it as one trains its reader to
// ignore the arrows.
//
// `pctChange` returns null when the baseline is zero — the tile then shows no
// arrow at all rather than "+∞%" or a misleading 100%.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import clsx from 'clsx';
import {
  BarChart,
  Card,
  CardTitle,
  ColumnChart,
  EmptyState,
  LinkButton,
  PageHeader,
  StatTile,
} from '@/components/ui';
import Reveal from '@/components/visual/Reveal';
import { Counter } from '@/components/visual/Effects';
import { requireRolePage } from '@/lib/guards';
import {
  countByStatus,
  listAppointments,
  revenueBetween,
  revenueByCustomer,
  revenueByEmployee,
  revenueByIndustry,
  revenueByService,
  revenueSeries,
  repeatCustomerStats,
} from '@/lib/repo/appointments';
import { employeeStats, satisfaction } from '@/lib/repo/jobs';
import { countUsersCreatedBetween } from '@/lib/repo/users';
import { membershipStats } from '@/lib/repo/loyalty';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { listEstimateRequests } from '@/lib/db';
import { getService } from '@/data/pricing';
import { getIndustry } from '@/lib/industries';
import { Industry } from '@/lib/types';
import {
  PERIOD_KEYS,
  PERIOD_LABEL,
  PeriodKey,
  dayPeriod,
  isPeriodKey,
  monthPeriod,
  pctChange,
  previousOf,
  resolvePeriod,
  trailingDays,
  weekPeriod,
  yearPeriod,
} from '@/lib/periods';
import { formatDate, todayIso } from '@/lib/timezone';
import { formatCurrency } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

/** Revenue for a window plus its trend against the preceding equal window. */
function revenueWithTrend(period: ReturnType<typeof dayPeriod>, tz: string) {
  const current = revenueBetween(period.from, period.to);
  const before = previousOf(period, tz);
  const previous = revenueBetween(before.from, before.to);
  return { ...current, trend: pctChange(current.revenue, previous.revenue) };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const user = await requireRolePage('manager', '/admin');
  const { timezone } = getSchedulingConfig();
  const today = todayIso(timezone);
  const sp = (await searchParams) ?? {};

  const periodKey: PeriodKey = isPeriodKey(sp.period) ? sp.period : '30d';
  const period = resolvePeriod(periodKey, timezone);

  // ── Headline revenue ───────────────────────────────────────────────────────
  const day = revenueWithTrend(dayPeriod(today, timezone), timezone);
  const week = revenueWithTrend(weekPeriod(today, timezone), timezone);
  const month = revenueWithTrend(monthPeriod(today, timezone), timezone);
  const year = revenueWithTrend(yearPeriod(today, timezone), timezone);

  // ── Charts ─────────────────────────────────────────────────────────────────
  const last30 = trailingDays(today, 30, timezone);
  const daily = revenueSeries(last30.from, last30.to);

  const byEmployee = revenueByEmployee(period.from, period.to);
  const byService = revenueByService(period.from, period.to);
  const byIndustry = revenueByIndustry(period.from, period.to);
  const topCustomers = revenueByCustomer(period.from, period.to, 8);

  // ── Operational counters ───────────────────────────────────────────────────
  const statuses = countByStatus(period.from, period.to);
  const completed = statuses.completed ?? 0;
  const periodRevenue = revenueBetween(period.from, period.to);
  const averageTicket = completed ? periodRevenue.revenue / completed : 0;

  const upcoming = listAppointments({ direction: 'upcoming', limit: 200 }).filter(
    (a) => a.status === 'scheduled' || a.status === 'confirmed'
  );

  // ── Estimate funnel ────────────────────────────────────────────────────────
  // The estimate table has no created_at index by period, so the whole recent
  // list is pulled and filtered here. At the volume this business generates
  // (hundreds a year) that is cheaper than another index.
  const estimates = listEstimateRequests(1000).filter(
    (e) => e.createdAt >= period.from && e.createdAt < period.to
  );
  const pendingEstimates = estimates.filter((e) => e.status === 'new' || e.status === 'contacted').length;
  const acceptedEstimates = estimates.filter((e) => e.status === 'scheduled').length;
  const conversionRate = estimates.length ? (acceptedEstimates / estimates.length) * 100 : null;

  // ── Customers ──────────────────────────────────────────────────────────────
  const newCustomers = countUsersCreatedBetween(period.from, period.to, 'customer');
  const beforePeriod = previousOf(period, timezone);
  const previousNewCustomers = countUsersCreatedBetween(
    beforePeriod.from,
    beforePeriod.to,
    'customer'
  );

  const repeat = repeatCustomerStats();
  const repeatPct = repeat.total ? (repeat.repeat / repeat.total) * 100 : 0;
  const memberships = membershipStats();
  const ratings = satisfaction(period.from, period.to);

  // ── Leaderboard ────────────────────────────────────────────────────────────
  // employeeStats LEFT JOINs every staff member, so people with no completed
  // work in the window come back with zeroes. They are dropped: a leaderboard
  // of mostly zeroes is noise, and "who did nothing" is a management
  // conversation, not a dashboard row.
  const leaderboard = employeeStats(period.from, period.to).filter((s) => s.jobsCompleted > 0);

  return (
    <>
      <PageHeader
        eyebrow={`${formatDate(period.from, timezone)} – ${formatDate(new Date(new Date(period.to).getTime() - 1), timezone)}`}
        title="Business"
        description="Completed work only. Cancelled and no-show bookings are excluded from every revenue figure on this page."
        action={
          <div className="flex gap-2">
            <LinkButton href="/admin/reports" variant="secondary" size="sm">
              Reports
            </LinkButton>
            <LinkButton href="/admin/schedule" size="sm">
              Schedule
            </LinkButton>
          </div>
        }
      />

      {/* ── Period selector ── */}
      <nav aria-label="Reporting period" className="mb-6 flex flex-wrap gap-2">
        {PERIOD_KEYS.map((key) => (
          <Link
            key={key}
            href={key === '30d' ? '/admin' : `/admin?period=${key}`}
            aria-current={key === periodKey ? 'page' : undefined}
            className={clsx(
              'rounded-full border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest2 transition-colors',
              key === periodKey
                ? 'border-apex bg-apex/10 text-white'
                : 'border-white/20 text-muted hover:border-white/50 hover:text-white'
            )}
          >
            {PERIOD_LABEL[key]}
          </Link>
        ))}
      </nav>

      {/* ── Revenue headlines ──
          The FOUR MONEY TILES are the only animated numbers on this page.
          <Counter> renders the final value in the server HTML and counts up
          only after mount, so nothing here depends on JavaScript being alive —
          and 800ms rather than the 1600ms default, because an owner checking
          today's takings between jobs should not have to wait for the figure to
          settle. Every other tile below stays static: a screen where a dozen
          numbers spin on arrival is a slot machine, not a dashboard. */}
      <section aria-label="Revenue" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Today" value={<Counter to={day.revenue} prefix="$" duration={800} />} sub={`${day.jobs} jobs`} trend={day.trend} />
        <StatTile label="This week" value={<Counter to={week.revenue} prefix="$" duration={800} />} sub={`${week.jobs} jobs`} trend={week.trend} />
        <StatTile label="This month" value={<Counter to={month.revenue} prefix="$" duration={800} />} sub={`${month.jobs} jobs`} trend={month.trend} />
        <StatTile label="This year" value={<Counter to={year.revenue} prefix="$" duration={800} />} sub={`${year.jobs} jobs`} trend={year.trend} />
      </section>

      {/* ── Daily revenue ── */}
      <Reveal>
        <Card className="mb-6">
          <CardTitle
            action={<span className="font-mono text-[11px] text-muted">Last 30 days</span>}
          >
            Daily revenue
          </CardTitle>
          <ColumnChart data={daily.map((d) => ({ key: d.key, value: d.revenue }))} format={formatCurrency} />
        </Card>
      </Reveal>

      {/* ── Operational counters ── */}
      <section aria-label="Operations" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Completed jobs" value={String(completed)} sub={PERIOD_LABEL[periodKey]} />
        <StatTile label="Average ticket" value={formatCurrency(averageTicket)} sub="Per completed job" />
        <StatTile label="Upcoming" value={String(upcoming.length)} sub="Scheduled or confirmed" />
        <StatTile
          label="Satisfaction"
          value={ratings.average ? `${ratings.average.toFixed(1)} / 5` : '—'}
          sub={`${ratings.count} rated`}
        />
      </section>

      <section aria-label="Pipeline" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Estimates pending" value={String(pendingEstimates)} sub="New or contacted" />
        <StatTile label="Estimates accepted" value={String(acceptedEstimates)} sub={`of ${estimates.length}`} />
        <StatTile
          label="Conversion"
          value={conversionRate === null ? '—' : `${conversionRate.toFixed(0)}%`}
          sub="Accepted ÷ total"
        />
        <StatTile label="Memberships" value={String(memberships.active)} sub="Active plans" />
      </section>

      <section aria-label="Customers" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="New customers"
          value={String(newCustomers)}
          sub={PERIOD_LABEL[periodKey]}
          trend={pctChange(newCustomers, previousNewCustomers)}
        />
        <StatTile
          label="Repeat rate"
          value={`${repeatPct.toFixed(0)}%`}
          sub={`${repeat.repeat} of ${repeat.total} all-time`}
        />
        <StatTile label="Cancelled" value={String(statuses.cancelled ?? 0)} sub={PERIOD_LABEL[periodKey]} />
        <StatTile label="No shows" value={String(statuses.no_show ?? 0)} sub={PERIOD_LABEL[periodKey]} />
      </section>

      {/* ── Breakdowns ──
          One <Reveal> around the whole grid, not one per card. Four cards
          fading in one after another is four separate things for the eye to
          wait on; the grid is a single unit of information and arrives as one.
          A short stagger (90ms) puts it just behind the chart above. */}
      <Reveal delay={90}>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="lift">
          <CardTitle>Revenue by technician</CardTitle>
          <BarChart
            data={byEmployee.map((b) => ({ key: b.key, value: b.revenue }))}
            format={formatCurrency}
          />
        </Card>

        <Card className="lift">
          <CardTitle>Revenue by service</CardTitle>
          <BarChart
            // Service ids are meaningless to a human; resolve to the catalogue
            // name and fall back to the id only for a retired service.
            data={byService.map((b) => ({ key: getService(b.key)?.name ?? b.key, value: b.revenue }))}
            format={formatCurrency}
          />
        </Card>

        <Card className="lift">
          <CardTitle>Revenue by industry</CardTitle>
          <BarChart
            data={byIndustry.map((b) => ({
              key: safeIndustryLabel(b.key),
              value: b.revenue,
            }))}
            format={formatCurrency}
          />
        </Card>

        <Card className="lift">
          <CardTitle>Top customers</CardTitle>
          <BarChart
            data={topCustomers.map((b) => ({ key: b.key, value: b.revenue }))}
            format={formatCurrency}
          />
        </Card>
      </div>
      </Reveal>

      {/* ── Leaderboard ──
          Deliberately NOT revealed and NOT lifted. It is a table a manager
          reads row by row; a table that fades in as you scroll to it is a table
          you have to wait to read. */}
      <Card>
        <CardTitle
          action={
            <Link
              href="/admin/employees"
              className="font-mono text-[11px] uppercase tracking-widest2 text-muted hover:text-white"
            >
              Manage staff
            </Link>
          }
        >
          Technician leaderboard · {PERIOD_LABEL[periodKey]}
        </CardTitle>

        {leaderboard.length === 0 ? (
          <EmptyState
            title="No completed jobs in this period"
            description="Once work is marked complete in the job runner, each technician's throughput, revenue and rating appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left font-mono text-[10px] uppercase tracking-widest2 text-subtle">
                  <th scope="col" className="py-2 pr-3 font-normal">Technician</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Jobs</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Revenue</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Avg ticket</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Avg mins</th>
                  <th scope="col" className="py-2 text-right font-normal">Rating</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((s) => (
                  <tr key={s.employeeId} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/admin/employees/${s.employeeId}`}
                        className="text-white underline decoration-white/20 underline-offset-4 hover:text-flare"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-muted">{s.jobsCompleted}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-white">
                      {formatCurrency(s.revenue)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-muted">
                      {formatCurrency(s.averageJobValue)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-muted">
                      {s.averageCompletionMinutes}
                    </td>
                    <td className="py-2.5 text-right font-mono text-muted">
                      {s.averageRating === null ? '—' : s.averageRating.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-6 text-[12px] leading-relaxed text-subtle">
        Signed in as {user.name}. Revenue is taken from each appointment&rsquo;s quoted total, which is
        the meaningful figure before card payments are connected. Once Stripe is live, settled
        payments become the authoritative number.
      </p>
    </>
  );
}

/**
 * `revenueByIndustry` groups on a raw column, so an industry that has since
 * been removed from lib/industries.ts would throw inside `getIndustry`.
 */
function safeIndustryLabel(key: string): string {
  try {
    return getIndustry(key as Industry).label;
  } catch {
    return key;
  }
}

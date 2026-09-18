// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports?type=…&format=csv&from=&to=
//
// CSV ONLY, AND HONESTLY SO. There is no PDF or XLSX branch here, and none is
// faked by renaming a CSV — a file that claims to be .xlsx and is not will be
// opened by a bookkeeper, fail, and be blamed on the data. See the README note
// on the reports page for what each real implementation would need.
//
// The escaping itself lives in lib/csv.ts — an App Router route file may only
// export HTTP handlers and framework config keys, and the RFC 4180 rules plus
// the spreadsheet formula-injection defence are worth reading (and testing) on
// their own rather than buried in a request handler.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, withAuth } from '@/lib/api';
import {
  listAppointments,
  revenueByCustomer,
  revenueByService,
  revenueSeries,
} from '@/lib/repo/appointments';
import { employeeStats } from '@/lib/repo/jobs';
import { listPlans, membershipStats } from '@/lib/repo/loyalty';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { listExpenses } from '@/lib/repo/expenses';
import { getAppointment } from '@/lib/repo/appointments';
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from '@/lib/models';
import { isAdmin } from '@/lib/rbac';
import { siteUrl } from '@/lib/business';
import { getService } from '@/data/pricing';
import { addDaysIso, dateAtMinutes, formatDateTime, todayIso } from '@/lib/timezone';
import { csvDocument } from '@/lib/csv';
import { isPeriodKey, resolvePeriod, trailingDays } from '@/lib/periods';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Report definitions ───────────────────────────────────────────────────────

const TYPES = [
  'revenue',
  'employees',
  'customers',
  'services',
  'appointments',
  'memberships',
  'expenses',
] as const;
type ReportType = (typeof TYPES)[number];

const money = (dollars: number) => dollars.toFixed(2);

export const GET = withAuth('manager', async ({ user, query, ipHash }) => {
  const type = (query.get('type') ?? 'revenue') as ReportType;
  if (!(TYPES as readonly string[]).includes(type)) {
    return fail(`Unknown report. Choose one of: ${TYPES.join(', ')}.`, 400);
  }
  // Expenses are the owner's tax data: the tightest scope in the API, same as
  // every /api/expenses route. Managers can pull every other report.
  if (type === 'expenses' && !isAdmin(user.role)) {
    return fail('Only administrators can export expenses.', 403);
  }

  const format = (query.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv') {
    // Explicit and specific. A vague 400 here would look like a bug rather
    // than a deliberate scope decision.
    return fail(
      'Only CSV export is implemented. PDF and XLSX would each need a rendering dependency, which this app does not have.',
      501
    );
  }

  const { timezone } = getSchedulingConfig();

  // Period resolution: an explicit from/to wins; otherwise ?period=, otherwise
  // the last 30 days. Dates are interpreted as LOCAL calendar days so a report
  // titled "1st–31st" contains exactly those local days.
  const fromParam = query.get('from');
  const toParam = query.get('to');
  const periodParam = query.get('period');

  let period =
    isPeriodKey(periodParam) ? resolvePeriod(periodParam, timezone) : trailingDays(todayIso(timezone), 30, timezone);

  if (fromParam && toParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    if (fromParam > toParam) return fail('The start date must come before the end date.', 400);
    period = {
      from: dateAtMinutes(fromParam, 0, timezone).toISOString(),
      to: dateAtMinutes(addDaysIso(toParam, 1), 0, timezone).toISOString(),
      fromDate: fromParam,
      toDate: toParam,
      label: `${fromParam} to ${toParam}`,
    };
  }

  let header: string[] = [];
  let rows: unknown[][] = [];

  switch (type) {
    case 'revenue': {
      header = ['Date', 'Completed jobs', 'Revenue (USD)'];
      rows = revenueSeries(period.from, period.to).map((b) => [b.key, b.jobs, money(b.revenue)]);
      break;
    }

    case 'employees': {
      header = [
        'Employee',
        'Jobs completed',
        'Revenue (USD)',
        'Average job value (USD)',
        'Minutes worked',
        'Average job minutes',
        'Average rating',
        'Ratings received',
      ];
      rows = employeeStats(period.from, period.to).map((s) => [
        s.name,
        s.jobsCompleted,
        money(s.revenue),
        money(s.averageJobValue),
        s.minutesWorked,
        s.averageCompletionMinutes,
        s.averageRating === null ? '' : s.averageRating.toFixed(2),
        s.ratingCount,
      ]);
      break;
    }

    case 'customers': {
      header = ['Customer', 'Completed jobs in period', 'Revenue in period (USD)'];
      // Limit is generous rather than the default 10 — an export is exactly the
      // case where a truncated top-N is the wrong answer.
      rows = revenueByCustomer(period.from, period.to, 5000).map((b) => [
        b.key,
        b.jobs,
        money(b.revenue),
      ]);
      break;
    }

    case 'services': {
      header = ['Service', 'Service id', 'Jobs', 'Attributed revenue (USD)'];
      rows = revenueByService(period.from, period.to).map((b) => [
        getService(b.key)?.name ?? b.key,
        b.key,
        b.jobs,
        money(b.revenue),
      ]);
      break;
    }

    case 'appointments': {
      header = [
        'Reference',
        'Starts',
        'Status',
        'Customer',
        'Email',
        'Phone',
        'Technician',
        'Vehicle',
        'Industry',
        'Services',
        'Location',
        'Address',
        'Quoted (USD)',
        'Estimated hours',
      ];
      rows = listAppointments({
        from: period.from,
        to: period.to,
        direction: 'all',
        limit: 5000,
      }).map((a) => [
        a.reference,
        formatDateTime(a.startsAt, timezone),
        a.status,
        a.customerName,
        a.customerEmail,
        a.customerPhone,
        a.employeeName ?? '',
        a.vehicleLabel ?? '',
        a.industry,
        a.serviceIds.map((id) => getService(id)?.name ?? id).join('; '),
        a.locationType,
        a.address,
        money(a.quotedTotal),
        a.estimatedHours,
      ]);
      break;
    }

    case 'memberships': {
      const stats = membershipStats();
      const plans = listPlans(false);
      header = ['Plan', 'Price (USD)', 'Interval', 'Discount %', 'Active members', 'Plan active'];
      rows = plans.map((p) => [
        p.name,
        money(p.priceCents / 100),
        p.interval,
        p.discountPct,
        stats.byPlan.find((b) => b.plan === p.name)?.count ?? 0,
        p.active ? 'yes' : 'no',
      ]);
      break;
    }

    case 'expenses': {
      header = [
        'Date',
        'Category',
        'Schedule C line',
        'Vendor',
        'Job',
        'Amount (USD)',
        'Deductible',
        'Comment',
        'Receipt',
      ];
      // Expenses carry a calendar date, not an instant, so the local date
      // bounds are used directly.
      rows = listExpenses({ from: period.fromDate, to: period.toDate, limit: 100_000 }).map((e) => [
        e.spentOn,
        expenseCategoryLabel(e.category),
        EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.scheduleC ?? '',
        e.vendor,
        e.appointmentId ? (getAppointment(e.appointmentId)?.reference ?? '') : '',
        money(e.amountCents / 100),
        e.deductible ? 'yes' : 'no',
        e.note,
        e.receiptKey ? `${siteUrl}/api/files/${e.receiptKey}` : '',
      ]);
      break;
    }
  }

  const body = csvDocument(header, rows);
  const filename = `${type}-${period.fromDate}-to-${period.toDate}.csv`;

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.EXPORT,
    entity: 'report',
    entityId: type,
    // Row count is recorded because an export is a bulk read of customer data;
    // "who took 4,000 customer records off this system, and when" is the
    // question an audit log has to be able to answer.
    meta: { type, rows: rows.length, from: period.fromDate, to: period.toDate },
    ipHash,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // The filename is built entirely from a validated type and two ISO dates,
      // so it cannot carry a quote or newline into the header.
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /admin/reports — the report builder.
//
// A GET <form> whose action is /api/reports. Choosing a report and a date range
// and pressing Download navigates the browser straight to the CSV endpoint,
// which answers with Content-Disposition: attachment — so the file downloads
// and the page never moves. No client component, no fetch, no blob URL, no
// JavaScript at all.
//
// A preview of the current selection is rendered above it from the same
// aggregates the export uses, so nobody downloads a file to find out it is
// empty.
//
// ⚠️ CSV ONLY. There is no PDF or XLSX button, and no button that pretends to
// be one. See the panel at the foot of the page — the honest statement of what
// is missing belongs in the product, not only in a hand-off note.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { Alert, Card, CardTitle, PageHeader, StatTile } from '@/components/ui';
import { requireRolePage } from '@/lib/guards';
import {
  listAppointments,
  revenueBetween,
  revenueByCustomer,
  revenueByService,
  revenueSeries,
} from '@/lib/repo/appointments';
import { employeeStats } from '@/lib/repo/jobs';
import { listPlans } from '@/lib/repo/loyalty';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { addDaysIso, dateAtMinutes, todayIso } from '@/lib/timezone';
import { formatCurrency } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

const REPORTS = [
  {
    value: 'revenue',
    label: 'Revenue by day',
    description: 'One row per calendar day: completed jobs and the money they made.',
  },
  {
    value: 'employees',
    label: 'Technician performance',
    description: 'Jobs, revenue, minutes worked and average rating per staff member.',
  },
  {
    value: 'customers',
    label: 'Customer spend',
    description: 'Every customer with completed work in the range, by revenue.',
  },
  {
    value: 'services',
    label: 'Service mix',
    description: 'Revenue attributed to each service, split evenly across a multi-service job.',
  },
  {
    value: 'appointments',
    label: 'Appointment register',
    description: 'Every booking in the range with customer, vehicle, technician and price.',
  },
  {
    value: 'memberships',
    label: 'Memberships',
    description: 'Each plan, its price and how many people are on it.',
  },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  await requireRolePage('manager', '/admin/reports');
  const { timezone } = getSchedulingConfig();
  const today = todayIso(timezone);
  const sp = (await searchParams) ?? {};

  const type = REPORTS.some((r) => r.value === sp.type) ? sp.type! : 'revenue';
  const fromDate = ISO_DATE.test(sp.from ?? '') ? sp.from! : addDaysIso(today, -29);
  const toDate = ISO_DATE.test(sp.to ?? '') ? sp.to! : today;

  const from = dateAtMinutes(fromDate, 0, timezone).toISOString();
  const to = dateAtMinutes(addDaysIso(toDate, 1), 0, timezone).toISOString();

  const summary = revenueBetween(from, to);

  // Row counts, so the preview says how big the file will be before it is
  // downloaded. Each is the same query the export runs.
  const rowCount = (() => {
    switch (type) {
      case 'employees':
        return employeeStats(from, to).length;
      case 'customers':
        return revenueByCustomer(from, to, 5000).length;
      case 'services':
        return revenueByService(from, to).length;
      case 'appointments':
        return listAppointments({ from, to, direction: 'all', limit: 5000 }).length;
      case 'memberships':
        return listPlans(false).length;
      case 'revenue':
      default:
        return revenueSeries(from, to).length;
    }
  })();

  const selected = REPORTS.find((r) => r.value === type)!;
  const downloadHref = `/api/reports?${new URLSearchParams({ type, format: 'csv', from: fromDate, to: toDate })}`;

  return (
    <>
      <PageHeader
        eyebrow="Exports"
        title="Reports"
        description="Pick a report and a date range. Files download as CSV."
      />

      <section aria-label="Range summary" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Range" value={`${rowCount} rows`} sub={selected.label} />
        <StatTile label="Completed jobs" value={String(summary.jobs)} sub={`${fromDate} → ${toDate}`} />
        <StatTile label="Revenue" value={formatCurrency(summary.revenue)} />
        <StatTile
          label="Average ticket"
          value={formatCurrency(summary.jobs ? summary.revenue / summary.jobs : 0)}
        />
      </section>

      <Card className="mb-6">
        <CardTitle>Build a report</CardTitle>

        {/* The form GETs /admin/reports so the preview updates; the Download
            link points at the API. Two targets, one set of inputs — which is
            why Apply and Download are separate buttons rather than one that
            has to guess. */}
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label htmlFor="type" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              Report
            </label>
            <select id="type" name="type" defaultValue={type} className="input-field">
              {REPORTS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="text-[12px] leading-snug text-subtle">{selected.description}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="from" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              From
            </label>
            <input id="from" name="from" type="date" defaultValue={fromDate} className="input-field" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="to" className="font-mono text-[11px] uppercase tracking-widest2 text-subtle">
              To
            </label>
            <input id="to" name="to" type="date" defaultValue={toDate} className="input-field" />
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-sm border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/60"
            >
              Update preview
            </button>
            <a
              href={downloadHref}
              // `download` is a hint; the API's Content-Disposition header is
              // what actually forces the save dialogue.
              download
              className="rounded-sm bg-apex px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-apex/90"
            >
              Download CSV
            </a>
          </div>
        </form>
      </Card>

      <Card className="mb-6">
        <CardTitle>All reports</CardTitle>
        <ul className="space-y-2">
          {REPORTS.map((r) => (
            <li
              key={r.value}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm text-white">{r.label}</p>
                <p className="text-[12px] text-subtle">{r.description}</p>
              </div>
              <div className="flex shrink-0 gap-3">
                <Link
                  href={`/admin/reports?${new URLSearchParams({ type: r.value, from: fromDate, to: toDate })}`}
                  className="text-[13px] text-muted hover:text-white"
                >
                  Preview
                </Link>
                <a
                  href={`/api/reports?${new URLSearchParams({ type: r.value, format: 'csv', from: fromDate, to: toDate })}`}
                  download
                  className="text-[13px] text-flare hover:text-white"
                >
                  CSV
                </a>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Alert tone="info" title="CSV only, deliberately">
        <p>
          There is no PDF or Excel export, and nothing here renames a CSV to look like one. A
          spreadsheet that fails to open is blamed on the data, not on the button.
        </p>
        <p className="mt-2">
          A real <strong>XLSX</strong> export needs a workbook writer — the format is a zip of XML
          parts, and hand-rolling one that Excel reliably opens is a project in itself. A real{' '}
          <strong>PDF</strong> needs either a PDF library or a headless browser to print an HTML
          template. Both mean a new dependency, which this build does not have.
        </p>
        <p className="mt-2">
          In the meantime every CSV here opens directly in Excel, Numbers and Sheets: it carries a
          UTF-8 byte-order mark so accented names decode correctly, and any field that could be read
          as a formula is escaped so an export cannot execute anything on the machine that opens it.
        </p>
      </Alert>
    </>
  );
}

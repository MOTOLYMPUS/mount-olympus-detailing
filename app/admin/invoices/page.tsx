// ─────────────────────────────────────────────────────────────────────────────
// /admin/invoices — raise and track client invoices.
//
// requireRolePage('admin'): the /admin floor is 'manager', but invoices are part
// of the finances surface the owner asked to keep to their own login, so this
// raises the bar like the other money pages.
//
// Customer names are resolved once into a map rather than per-row, so a long
// invoice list is a single users read, not N of them.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRolePage } from '@/lib/guards';
import { listInvoices } from '@/lib/repo/payments';
import { listUsers } from '@/lib/repo/users';
import { formatMoney } from '@/lib/pricing';
import { formatDate } from '@/lib/timezone';
import { getSchedulingConfig } from '@/lib/repo/settings';
import { PageHeader, Card, StatusBadge, EmptyState } from '@/components/ui';
import InvoiceCreator from '@/components/admin/InvoiceCreator';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invoices',
  robots: { index: false, follow: false },
};

export default async function InvoicesPage() {
  await requireRolePage('admin');

  const invoices = listInvoices({ limit: 200 });
  const customers = listUsers({ roles: ['customer'], limit: 500 });
  const tz = getSchedulingConfig().timezone;

  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  const customerOptions = customers.map((c) => ({
    id: c.id,
    label: `${c.name} · ${c.email}`,
  }));

  const outstanding = invoices
    .filter((i) => i.status === 'sent')
    .reduce((s, i) => s + i.totalCents, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finances"
        title="Invoices"
        description="Bill clients, take card or bank payment, and track what is still owed."
      />

      <Card>
        <h2 className="eyebrow mb-4">Create an invoice</h2>
        {customerOptions.length === 0 ? (
          <p className="text-sm text-muted">
            No customers yet. Invoices attach to a customer account, so add one first.
          </p>
        ) : (
          <InvoiceCreator customers={customerOptions} />
        )}
      </Card>

      {outstanding > 0 && (
        <p className="text-sm text-muted">
          Outstanding (issued, unpaid):{' '}
          <span className="font-mono text-white">{formatMoney(outstanding)}</span>
        </p>
      )}

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create one above to bill a client for completed work."
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left font-mono text-[11px] uppercase tracking-widest2 text-subtle">
                <th className="px-4 py-2.5 font-normal">Number</th>
                <th className="px-4 py-2.5 font-normal">Customer</th>
                <th className="px-4 py-2.5 font-normal">Issued</th>
                <th className="px-4 py-2.5 text-right font-normal">Total</th>
                <th className="px-4 py-2.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoices.map((inv) => (
                <tr key={inv.id} className="text-white/90 transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-mono text-[13px]">
                    <Link href={`/admin/invoices/${inv.id}`} className="text-flare hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{nameById.get(inv.userId) ?? 'Unknown'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {inv.issuedAt ? formatDate(inv.issuedAt, tz) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                    {formatMoney(inv.totalCents)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

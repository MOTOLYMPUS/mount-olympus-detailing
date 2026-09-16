'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Invoice actions (admin/manager): raise a card/ACH payment link, record a
// manual payment, mark paid, or void.
//
// "Charge by card" asks the server for a hosted Stripe Checkout link and shows
// it for the owner to copy or open — card data never touches this app. When the
// client pays, the webhook flips the invoice to paid on its own, so the manual
// "Mark paid" button is only for cash / Zelle / off-platform settlement.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, buttonClass } from '@/components/ui';
import { Invoice } from '@/lib/models';

export default function InvoiceActions({
  invoice,
  stripeConfigured,
}: {
  invoice: Invoice;
  stripeConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [banner, setBanner] = useState('');
  const [link, setLink] = useState('');

  const settled = invoice.status === 'paid' || invoice.status === 'void';

  async function patchStatus(status: Invoice['status']) {
    setPending(status);
    setBanner('');
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setBanner(data.error ?? 'That did not work.');
        return;
      }
      router.refresh();
    } catch {
      setBanner('We could not reach the server.');
    } finally {
      setPending(null);
    }
  }

  async function charge() {
    setPending('charge');
    setBanner('');
    setLink('');
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/charge`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setBanner(data.error ?? 'Could not create a payment link.');
        return;
      }
      setLink(data.checkoutUrl);
      router.refresh();
    } catch {
      setBanner('We could not reach the server.');
    } finally {
      setPending(null);
    }
  }

  if (settled) {
    return (
      <Alert tone={invoice.status === 'paid' ? 'positive' : 'info'}>
        This invoice is {invoice.status}.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {banner && <Alert tone="danger">{banner}</Alert>}

      {link && (
        <Alert tone="info" title="Payment link ready">
          <p className="mb-2 text-[13px]">Send this to the customer. It accepts card and, where enabled, bank transfer (ACH):</p>
          <p className="my-1 select-all break-all rounded-sm border border-white/20 bg-obsidian px-3 py-2 font-mono text-[12px] text-white">
            {link}
          </p>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('secondary', 'sm', 'mt-2')}
          >
            Open payment page
          </a>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {stripeConfigured ? (
          <button
            type="button"
            onClick={charge}
            disabled={pending !== null}
            className={buttonClass('primary', 'sm')}
          >
            {pending === 'charge' ? 'Creating link…' : 'Charge by card / bank'}
          </button>
        ) : (
          <span className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            Add Stripe keys to charge cards. You can still mark manual payments.
          </span>
        )}

        <button
          type="button"
          onClick={() => patchStatus('paid')}
          disabled={pending !== null}
          className={buttonClass('secondary', 'sm')}
        >
          {pending === 'paid' ? 'Saving…' : 'Mark paid (cash / Zelle)'}
        </button>

        {invoice.status === 'draft' && (
          <button
            type="button"
            onClick={() => patchStatus('sent')}
            disabled={pending !== null}
            className={buttonClass('ghost', 'sm')}
          >
            {pending === 'sent' ? 'Saving…' : 'Mark as issued'}
          </button>
        )}

        <button
          type="button"
          onClick={() => patchStatus('void')}
          disabled={pending !== null}
          className={buttonClass('ghost', 'sm', 'text-subtle hover:text-apex')}
        >
          Void
        </button>
      </div>
    </div>
  );
}

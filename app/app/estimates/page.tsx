import { requirePage } from '@/lib/guards';
import { listEstimateRequestsByEmail } from '@/lib/db';
import { formatPrice } from '@/lib/pricing';
import { getAddOn, getService } from '@/data/pricing';
import { sizeLabel } from '@/lib/industries';
import { relativeTime } from '@/lib/timezone';
import EstimateActions from '@/components/estimates/EstimateActions';
import { Alert, Card, EmptyState, LinkButton, PageHeader, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My quotes' };

export default async function EstimatesPage() {
  const user = await requirePage('/app/estimates');

  // Matched on email, so a quote requested from the public site before this
  // person had an account still shows up here once they register.
  const estimates = listEstimateRequestsByEmail(user.email, 50);

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Quotes"
        title="Your estimates"
        description="Every quote you have requested, including any from before you created an account."
        action={<LinkButton href="/app/book">Book directly</LinkButton>}
      />

      {estimates.length === 0 ? (
        <EmptyState
          title="No quotes yet"
          description="Request one from the main site, or skip straight to booking — the price is calculated the same way either way."
          action={<LinkButton href="/app/book">Book a service</LinkButton>}
        />
      ) : (
        <ul className="space-y-4">
          {estimates.map((e) => {
            const services = e.serviceIds.map((id) => getService(id)?.name ?? id);
            const addOns = e.addOnIds.map((id) => getAddOn(id)?.name ?? id);

            // Carry the quote's selections into the booking flow so the
            // customer does not re-pick what they already chose.
            const bookHref = `/app/book?service=${encodeURIComponent(e.serviceIds[0] ?? '')}`;

            return (
              <Card as="li" key={e.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold text-white">
                      {e.year} {e.make} {e.model}
                    </p>
                    <p className="mt-0.5 text-[12px] text-subtle">
                      {sizeLabel(e.sizeClass)} · ref {e.reference} · {relativeTime(e.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </div>

                <p className="text-[13px] text-muted">
                  {services.join(', ')}
                  {addOns.length ? ` · + ${addOns.join(', ')}` : ''}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
                  <div>
                    <p className="font-display text-xl font-bold text-white">
                      {formatPrice(e.quotedTotal, e.quotedTotalMax)}
                    </p>
                    <p className="text-[12px] text-subtle">about {e.estimatedHours} hours</p>
                  </div>
                  <EstimateActions estimateId={e.id} status={e.status} bookHref={bookHref} />
                </div>

                {e.isPlaceholderPricing && (
                  <div className="mt-4">
                    <Alert tone="warning">
                      Pricing for this industry is still being finalised — treat this figure as
                      indicative. We will confirm before any work starts.
                    </Alert>
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}

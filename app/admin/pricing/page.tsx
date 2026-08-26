// ─────────────────────────────────────────────────────────────────────────────
// /admin/pricing — edit the price of any service, live.
//
// requireRolePage('admin'). Prices decide revenue and are quoted straight to
// customers, so this is admin+, not manager.
//
// The page builds the whole matrix on the server (code defaults + current
// overrides) and hands it to one client editor. Each cell shows its effective
// price; the code default sits underneath so the owner always sees what they
// are changing from and can reset to it.
//
// SCOPE: this edits the NUMBERS. Which services exist, which sizes each offers,
// their names and descriptions, stay in code (data/pricing/*) — changing those
// is a structural change that ships with a deploy. Overriding a number is
// instant and needs no deploy.
// ─────────────────────────────────────────────────────────────────────────────

import { Alert, PageHeader } from '@/components/ui';
import PricingEditor, { IndustryPricing } from '@/components/admin/PricingEditor';
import { requireRolePage } from '@/lib/guards';
import { allAddOns, pricingIsPlaceholder, servicesForIndustry } from '@/data/pricing';
import { getPriceOverrides, overrideCount } from '@/lib/repo/pricing';
import { getIndustry, sizeLabel } from '@/lib/industries';
import { INDUSTRIES, Industry, Price, SizeClass } from '@/lib/types';

export const dynamic = 'force-dynamic';

function buildIndustry(industry: Industry, overrides: ReturnType<typeof getPriceOverrides>): IndustryPricing {
  const cfg = getIndustry(industry);
  const services = servicesForIndustry(industry);
  const addOns = allAddOns.filter((a) => a.industry === industry);

  const row = (item: { id: string; name: string; prices: Partial<Record<SizeClass, Price>> }, kind: 'service' | 'addon') => ({
    id: item.id,
    name: item.name,
    kind,
    cells: (Object.keys(item.prices) as SizeClass[]).map((size) => {
      const def = item.prices[size]!;
      const ov = overrides[item.id]?.[size];
      return {
        size,
        label: sizeLabel(size),
        defaultPrice: def.price,
        defaultPriceMax: def.priceMax,
        price: (ov ?? def).price,
        priceMax: (ov ?? def).priceMax,
        overridden: ov !== undefined,
      };
    }),
  });

  return {
    industry,
    label: cfg.label,
    placeholder: pricingIsPlaceholder[industry],
    // Services first, add-ons after — the same order the customer meets them.
    items: [...services.map((s) => row(s, 'service')), ...addOns.map((a) => row(a, 'addon'))],
  };
}

export default function AdminPricingPage() {
  requireRolePage('admin', '/admin/pricing');

  const overrides = getPriceOverrides();
  const data = INDUSTRIES.map((i) => buildIndustry(i, overrides));
  const changed = overrideCount(overrides);

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Pricing"
        description="Edit any service price. Changes are live immediately — no deploy — across the estimate, booking, and every quote."
      />

      <Alert tone="warning" title="These take effect immediately">
        A saved price is the number customers are quoted from that moment — in the estimate wizard,
        the booking flow, and the emails you receive. There is no draft state.
        {changed > 0 && <> You currently have <strong>{changed}</strong> price{changed === 1 ? '' : 's'} overriding the built-in defaults.</>}
      </Alert>

      <div className="mt-6">
        <PricingEditor data={data} />
      </div>
    </>
  );
}

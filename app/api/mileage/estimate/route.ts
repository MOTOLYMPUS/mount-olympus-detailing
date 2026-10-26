// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mileage/estimate — { from?, to } → driving miles one way and round
// trip, for the preview on the marketing-expense form. Nothing is saved.
//
// Admin only, like the rest of the mileage log. One routing call with the legs
// from → to → from gives both figures. `from` falls back to the business
// address in the tax profile. A failed lookup returns 200 with `reason`, so the
// form can say why rather than show an error banner.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, str, withAuth } from '@/lib/api';
import { routeLegs } from '@/lib/geo';
import { getTaxProfile } from '@/lib/repo/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  'admin',
  async ({ body }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const from = str(b.from, 200) || getTaxProfile().baseAddress;
    const to = str(b.to, 200);
    if (!from || !to) return fail('Enter both addresses.', 400);

    const legs = await routeLegs([from, to, from]);
    if (!legs.ok) return ok({ estimate: null, reason: legs.reason });
    const [there, back] = legs.legsTenths;
    return ok({ estimate: { oneWayTenths: there, roundTripTenths: there + back } });
  },
  { limit: 'api' }
);

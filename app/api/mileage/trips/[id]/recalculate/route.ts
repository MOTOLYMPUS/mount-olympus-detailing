// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mileage/trips/:id/recalculate — look up the driving distance for
// the trip's addresses now, and switch it back to the 'route' source.
//
// Waits for the answer (a few seconds at most: the map services are rate
// limited to one call a second) so the owner sees the miles or the reason.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, withAuth } from '@/lib/api';
import { getTrip, updateTrip } from '@/lib/repo/mileage';
import { recalculateTrip } from '@/lib/mileage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  'admin',
  async ({ params }) => {
    const trip = getTrip(params.id);
    if (!trip) return fail('Trip not found.', 404);
    if (trip.source !== 'route') {
      updateTrip(trip.id, { ...trip, source: 'route', odometerStart: null, odometerEnd: null });
    }
    return ok({ trip: await recalculateTrip(trip.id) });
  },
  { limit: 'api' }
);

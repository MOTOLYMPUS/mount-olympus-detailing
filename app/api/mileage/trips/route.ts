// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/mileage/trips?year=2026&vehicle=<id|none> — the trip log (admin only)
// POST /api/mileage/trips — log a trip by hand: supply run, car show,
//      prospecting, or a GPS-tracked drive
//
// Job trips are created by the completion hook (lib/mileage.ts), not here.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, str, withAuth } from '@/lib/api';
import { parseTripInput } from '@/lib/validation-mileage';
import { createTrip, listTrips } from '@/lib/repo/mileage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('admin', async ({ query }) => {
  const year = Number(query.get('year'));
  const valid = Number.isInteger(year) && year >= 2000 && year <= 2100;
  return ok({
    trips: listTrips({
      from: valid ? `${year}-01-01` : undefined,
      to: valid ? `${year}-12-31` : undefined,
      vehicleId: str(query.get('vehicle'), 60) || undefined,
    }),
  });
});

export const POST = withAuth(
  'admin',
  async ({ user, body }) => {
    const input = parseTripInput((body ?? {}) as Record<string, unknown>);
    // A hand-logged trip has no job stops; ignore any appointment ids sent.
    input.stops = input.stops.map(({ label, address }) => ({ label, address }));
    return ok({ trip: createTrip(input, user.id) }, { status: 201 });
  },
  { limit: 'api' }
);

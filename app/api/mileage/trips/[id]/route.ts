// ─────────────────────────────────────────────────────────────────────────────
// PATCH  /api/mileage/trips/:id — edit a trip (full shape, as POST)
// DELETE /api/mileage/trips/:id — remove it
//
// A trip still on the 'route' source whose addresses changed (or whose miles
// are blank) has its distance looked up again after the response.
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, withAuth } from '@/lib/api';
import { parseTripInput } from '@/lib/validation-mileage';
import { deleteTrip, getTrip, updateTrip } from '@/lib/repo/mileage';
import { CALCULATING, recalculateTrip } from '@/lib/mileage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = (t: { startAddress: string; stops: { address: string }[]; endAddress: string }) =>
  JSON.stringify([t.startAddress, ...t.stops.map((s) => s.address), t.endAddress]);

export const PATCH = withAuth('admin', async ({ params, body }) => {
  const current = getTrip(params.id);
  if (!current) return fail('Trip not found.', 404);

  const input = parseTripInput((body ?? {}) as Record<string, unknown>, current.tripDate);
  // Job stops keep their link to the job; a stop cannot be pointed at another.
  const jobIds = new Set(current.appointmentIds);
  input.stops = input.stops.map((s) =>
    s.appointmentId && jobIds.has(s.appointmentId) ? s : { label: s.label, address: s.address }
  );

  const lookup = input.source === 'route' && (input.milesTenths === null || route(input) !== route(current));
  if (lookup) {
    input.milesTenths = null;
    input.needsReview = true;
    input.reviewReason = CALCULATING;
  }

  const trip = updateTrip(current.id, input);
  if (lookup) recalculateTrip(current.id).catch((e) => console.error('[mileage] recalculation failed', e));
  return ok({ trip });
});

export const DELETE = withAuth('admin', async ({ params }) => {
  if (!deleteTrip(params.id)) return fail('Trip not found.', 404);
  return ok({ deleted: true });
});

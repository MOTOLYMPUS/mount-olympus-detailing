// ─────────────────────────────────────────────────────────────────────────────
// PATCH  /api/mileage/vehicles/:id — replace a vehicle's details and, when
//        `years` is sent, its whole set of per-year odometer readings
// DELETE /api/mileage/vehicles/:id — remove it; its trips stay, unassigned
// ─────────────────────────────────────────────────────────────────────────────

import { fail, ok, withAuth } from '@/lib/api';
import { parseVehicleInput, parseVehicleYears } from '@/lib/validation-mileage';
import {
  deleteBusinessVehicle,
  getBusinessVehicle,
  removeVehicleYear,
  setVehicleYear,
  updateBusinessVehicle,
} from '@/lib/repo/mileage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuth('admin', async ({ params, body }) => {
  const current = getBusinessVehicle(params.id);
  if (!current) return fail('Vehicle not found.', 404);

  const b = (body ?? {}) as Record<string, unknown>;
  const input = parseVehicleInput(b);
  const years = parseVehicleYears(b.years);

  updateBusinessVehicle(current.id, input);
  if (years) {
    const keep = new Set(years.map((y) => y.taxYear));
    for (const old of current.years) if (!keep.has(old.taxYear)) removeVehicleYear(current.id, old.taxYear);
    for (const y of years) setVehicleYear(current.id, y);
  }
  return ok({ vehicle: getBusinessVehicle(current.id) });
});

export const DELETE = withAuth('admin', async ({ params }) => {
  if (!deleteBusinessVehicle(params.id)) return fail('Vehicle not found.', 404);
  return ok({ deleted: true });
});

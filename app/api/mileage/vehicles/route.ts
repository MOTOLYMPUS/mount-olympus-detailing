// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/mileage/vehicles — the business's vehicles (admin only)
// POST /api/mileage/vehicles — add one
//
// Admin, like expenses: vehicles and trips are the owner's tax records.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, withAuth } from '@/lib/api';
import { parseVehicleInput, parseVehicleYears } from '@/lib/validation-mileage';
import { createBusinessVehicle, getBusinessVehicle, listBusinessVehicles, setVehicleYear } from '@/lib/repo/mileage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('admin', async () => ok({ vehicles: listBusinessVehicles() }));

export const POST = withAuth(
  'admin',
  async ({ body }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const input = parseVehicleInput(b);
    const years = parseVehicleYears(b.years);
    const vehicle = createBusinessVehicle(input);
    for (const y of years ?? []) setVehicleYear(vehicle.id, y);
    return ok({ vehicle: getBusinessVehicle(vehicle.id) }, { status: 201 });
  },
  { limit: 'api' }
);

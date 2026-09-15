import { NextResponse } from 'next/server';
import { fail, ok, withAuth } from '@/lib/api';
import {
  archiveVehicle,
  getVehicle,
  restoreVehicle,
  setDefaultVehicle,
  updateVehicle,
} from '@/lib/repo/vehicles';
import { validateVehicle } from '@/lib/validation-account';
import { remove } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A vehicle photo must be one of OUR uploads in the vehicles scope — the exact
// shape lib/uploads.ts generates. Anything else (an external URL, a job photo,
// a data: URI) is refused, so the field can never point outside /api/files.
const VEHICLE_PHOTO_URL = /^\/api\/files\/(vehicles\/[0-9a-f-]{36}\.(jpg|png|gif|webp|heic))$/;

/**
 * Ownership is checked on every verb. Returning 404 rather than 403 for
 * someone else's vehicle means the endpoint does not confirm that the id
 * exists at all.
 */
function ownedOr404(id: string, userId: string) {
  const vehicle = getVehicle(id);
  return vehicle && vehicle.userId === userId ? vehicle : null;
}

export const GET = withAuth('any', async ({ user, params }) => {
  const vehicle = ownedOr404(params.id, user.id);
  if (!vehicle) return fail('Vehicle not found.', 404);
  return NextResponse.json({ ok: true, vehicle });
});

export const PATCH = withAuth('any', async ({ user, params, body }) => {
  const existing = ownedOr404(params.id, user.id);
  if (!existing) return fail('Vehicle not found.', 404);

  const b = (body ?? {}) as Record<string, unknown>;

  // Two lightweight actions that do not need the full form payload.
  if (b.action === 'setDefault') {
    setDefaultVehicle(user.id, existing.id);
    return ok({ vehicle: getVehicle(existing.id) });
  }
  if (b.action === 'restore') {
    restoreVehicle(existing.id);
    return ok({ vehicle: getVehicle(existing.id) });
  }
  if (b.action === 'setPhoto') {
    // null clears the photo; a string must be one of our own vehicle uploads.
    const raw = b.photoUrl;
    let photoUrl: string | null = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      if (typeof raw !== 'string' || !VEHICLE_PHOTO_URL.test(raw)) {
        return fail('That photo could not be used.', 400);
      }
      photoUrl = raw;
    }

    // Replacing or removing a photo orphans the old file; delete it rather
    // than let the uploads volume fill with pictures nothing references.
    const previous = existing.photoUrl;
    if (previous && previous !== photoUrl) {
      const match = VEHICLE_PHOTO_URL.exec(previous);
      if (match) await remove(match[1]);
    }

    return ok({ vehicle: updateVehicle(existing.id, { photoUrl }) });
  }

  const result = validateVehicle({ ...existing, ...b });
  if (!result.ok || !result.value) return fail('Please check the form.', 400, result.errors);

  const vehicle = updateVehicle(existing.id, result.value);
  return ok({ vehicle });
});

export const DELETE = withAuth('any', async ({ user, params }) => {
  const existing = ownedOr404(params.id, user.id);
  if (!existing) return fail('Vehicle not found.', 404);

  // Archive, never delete — appointments reference this row, and the history of
  // work done on a car the customer has since sold must survive.
  archiveVehicle(existing.id);
  return ok({ archived: true });
});

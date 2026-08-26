// ─────────────────────────────────────────────────────────────────────────────
// GET/POST/DELETE /api/admin/service-areas
//
// A service area sets the travel time and surcharge for a postcode. It feeds
// straight into `createBooking`, so a bad travel figure does not just look
// wrong — it books a technician a slot they cannot physically reach.
//
// ⚠️ DELETE IS A DEACTIVATION, not a row removal. Appointments carry a
// `service_area_id`, and hard-deleting the area would leave historical bookings
// pointing at nothing — breaking the reports that explain WHY a job took an
// extra hour of travel. `active = false` hides it from new bookings and keeps
// the history intact. lib/repo/settings.ts has no delete function for exactly
// this reason.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, int, ok, str, stringArray, withAuth } from '@/lib/api';
import { getServiceArea, listServiceAreas, upsertServiceArea } from '@/lib/repo/settings';
import { AUDIT, audit } from '@/lib/repo/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth('manager', async ({ query }) => {
  return NextResponse.json({
    ok: true,
    areas: listServiceAreas(query.get('active') === '1'),
  });
});

export const POST = withAuth('admin', async ({ user, body, ipHash }) => {
  const b = (body ?? {}) as Record<string, unknown>;

  const id = str(b.id, 60) || undefined;
  if (id && !getServiceArea(id)) return fail('That service area no longer exists.', 404);

  const name = str(b.name, 120);
  if (!name) return fail('Give the area a name.', 400, { name: 'What is it called?' });

  const area = upsertServiceArea({
    id,
    name,
    // Uppercased and de-duplicated by stringArray; postcodes are matched
    // case-insensitively at booking time and 'ab1' vs 'AB1' would otherwise be
    // two different areas.
    postalCodes: stringArray(b.postalCodes, 200, 12).map((p) => p.toUpperCase()),
    travelMinutes: Math.min(480, Math.max(0, int(b.travelMinutes, 30))),
    surchargeCents: Math.min(100_000, Math.max(0, int(b.surchargeCents, 0))),
    active: b.active !== false,
  });

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'service_area',
    entityId: area.id,
    meta: { name: area.name, created: !id },
    ipHash,
  });

  return ok({ area, areas: listServiceAreas() }, { status: id ? 200 : 201 });
});

export const DELETE = withAuth('admin', async ({ user, query, ipHash }) => {
  const id = str(query.get('id'), 60);
  const existing = id ? getServiceArea(id) : null;
  if (!existing) return fail('That service area is not in the list.', 404);

  const area = upsertServiceArea({ ...existing, active: false });

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'service_area',
    entityId: area.id,
    meta: { deactivated: area.name },
    ipHash,
  });

  return ok({ areas: listServiceAreas() });
});

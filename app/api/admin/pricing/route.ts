// ─────────────────────────────────────────────────────────────────────────────
// Admin pricing overrides.
//
//   GET   /api/admin/pricing            → current overrides + count
//   PATCH /api/admin/pricing            → set one cell  { id, size, price, priceMax? }
//                                         (price: null resets the cell to default)
//   DELETE /api/admin/pricing?id=…      → reset every override for one service
//
// Admin+ only. Every write is validated against the CODE CATALOG first: you can
// only override a (service × size) that actually exists, so a typo or a stale
// id can never create a phantom price. Every change is audit-logged.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { fail, ok, withAuth } from '@/lib/api';
import { getAddOn, getService } from '@/data/pricing';
import {
  clearOverridesFor,
  getPriceOverrides,
  overrideCount,
  setPriceOverride,
} from '@/lib/repo/pricing';
import { AUDIT, audit } from '@/lib/repo/audit';
import { SizeClass } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sanity ceiling — a detailing service priced above this is a fat-finger, not a quote. */
const MAX_PRICE = 1_000_000;

function catalogItem(id: string) {
  return getService(id) ?? getAddOn(id) ?? null;
}

export const GET = withAuth('admin', async () => {
  const overrides = getPriceOverrides();
  return NextResponse.json({ ok: true, overrides, count: overrideCount(overrides) });
});

export const PATCH = withAuth('admin', async ({ user, body, ipHash }) => {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id : '';
  const size = typeof b.size === 'string' ? (b.size as SizeClass) : ('' as SizeClass);

  const item = catalogItem(id);
  if (!item) return fail('Unknown service.', 400, { id: 'That service no longer exists.' });

  // The base cell must exist — overrides are numeric edits to real cells only.
  if (item.prices[size] === undefined) {
    return fail('That size is not offered for this service.', 400, {
      size: 'This service has no price for that size.',
    });
  }

  // price === null → reset this cell to the code default.
  if (b.price === null) {
    const overrides = setPriceOverride(id, size, null);
    audit({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT.SETTINGS_UPDATE,
      entity: 'pricing',
      entityId: id,
      meta: { size, reset: true },
      ipHash,
    });
    return ok({ overrides, count: overrideCount(overrides) });
  }

  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    return fail('Enter a valid price.', 400, { price: `A number between 0 and ${MAX_PRICE}.` });
  }

  // Optional upper bound for a ranged quote (e.g. "$50–$75").
  let priceMax: number | undefined;
  if (b.priceMax !== undefined && b.priceMax !== null && b.priceMax !== '') {
    priceMax = Number(b.priceMax);
    if (!Number.isFinite(priceMax) || priceMax < price || priceMax > MAX_PRICE) {
      return fail('The upper price must be at least the base price.', 400, {
        priceMax: 'Must be ≥ the base price.',
      });
    }
  }

  const value = { price: Math.round(price), ...(priceMax ? { priceMax: Math.round(priceMax) } : {}) };
  const overrides = setPriceOverride(id, size, value);

  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'pricing',
    entityId: id,
    meta: { size, ...value },
    ipHash,
  });

  return ok({ overrides, count: overrideCount(overrides) });
});

export const DELETE = withAuth('admin', async ({ user, query, ipHash }) => {
  const id = query.get('id') ?? '';
  if (!id) return fail('Which service?', 400);

  const overrides = clearOverridesFor(id);
  audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT.SETTINGS_UPDATE,
    entity: 'pricing',
    entityId: id,
    meta: { resetRow: true },
    ipHash,
  });
  return ok({ overrides, count: overrideCount(overrides) });
});

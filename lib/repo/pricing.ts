// ─────────────────────────────────────────────────────────────────────────────
// Admin price overrides — persistence.
//
// Stored as a single JSON blob in the `settings` table (key `price_overrides`),
// not a table of its own: the whole override set is tiny (a few dozen cells at
// most), always read in full by the pricing engine, and never queried by parts.
// One row keeps it atomic to write and trivial to read.
//
// Shape:  { [serviceOrAddOnId]: { [sizeClass]: { price, priceMax? } } }
//
// An override is ONLY ever a number for a cell the code catalog already offers —
// see lib/pricing.ts `priceFor`. This module does not validate that the id/size
// exist in the catalog; the admin API does, before writing, so a stale override
// can never reach storage.
// ─────────────────────────────────────────────────────────────────────────────

import { getSetting, setSetting } from './settings';
import { Price, SizeClass } from '../types';
import { PriceOverrides } from '../pricing';

const KEY = 'price_overrides';

export function getPriceOverrides(): PriceOverrides {
  return getSetting<PriceOverrides>(KEY, {});
}

/** Replace the entire override set (used by the admin "save all" action). */
export function setPriceOverrides(overrides: PriceOverrides): void {
  setSetting(KEY, overrides);
}

/**
 * Set or clear one cell. Passing `null` removes the override so the code
 * default takes over again — that is how "reset to default" works, and why an
 * empty override object is pruned rather than left as clutter.
 */
export function setPriceOverride(id: string, size: SizeClass, price: Price | null): PriceOverrides {
  const all = getPriceOverrides();

  if (price === null) {
    if (all[id]) {
      delete all[id][size];
      if (Object.keys(all[id]).length === 0) delete all[id];
    }
  } else {
    all[id] = { ...(all[id] ?? {}), [size]: price };
  }

  setPriceOverrides(all);
  return all;
}

/** Remove every override for one service/add-on (reset a whole row). */
export function clearOverridesFor(id: string): PriceOverrides {
  const all = getPriceOverrides();
  delete all[id];
  setPriceOverrides(all);
  return all;
}

/** How many cells are currently overridden — shown in the admin header. */
export function overrideCount(overrides: PriceOverrides = getPriceOverrides()): number {
  return Object.values(overrides).reduce((n, row) => n + Object.keys(row).length, 0);
}

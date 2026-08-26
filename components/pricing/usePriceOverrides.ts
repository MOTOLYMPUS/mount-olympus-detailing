'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Fetch the admin price overrides once, share them across the whole client.
//
// Every price the customer sees before submitting — the service cards, the
// wizard chips, the live total — must match the number the SERVER will
// authoritatively store. The server reads overrides straight from the database;
// the client cannot, so it fetches them here from the public /api/pricing
// endpoint and feeds them into the same lib/pricing helpers.
//
// One module-level cache + a single in-flight promise means many components can
// call this hook and only ONE request goes out per page load. It fails open to
// "no overrides" (code defaults) so a hiccup here can never blank a price.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import type { PriceOverrides } from '@/lib/pricing';

let cache: PriceOverrides | null = null;
let inflight: Promise<PriceOverrides> | null = null;

function load(): Promise<PriceOverrides> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch('/api/pricing')
      .then((r) => (r.ok ? r.json() : { overrides: {} }))
      .then((d) => {
        cache = (d?.overrides as PriceOverrides) ?? {};
        return cache;
      })
      .catch(() => {
        cache = {};
        return cache;
      });
  }
  return inflight;
}

export function usePriceOverrides(): PriceOverrides {
  const [overrides, setOverrides] = useState<PriceOverrides>(cache ?? {});

  useEffect(() => {
    let alive = true;
    load().then((o) => {
      if (alive) setOverrides(o);
    });
    return () => {
      alive = false;
    };
  }, []);

  return overrides;
}

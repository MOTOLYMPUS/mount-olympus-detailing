// ─────────────────────────────────────────────────────────────────────────────
// Geocoding and driving distance, behind one small interface.
//
// DEFAULT PROVIDER — OpenStreetMap: Nominatim turns an address into a point,
// OSRM gives the driving distance through a list of points. Both are free
// public services with usage policies this module follows:
//   • an identifying User-Agent with a contact address,
//   • at most ~1 request per second (one shared queue below),
//   • every geocode cached (geocode_cache), so a repeat customer costs nothing.
//
// SWITCHES (.env):
//   GEO_PROVIDER=osm   (default) the public OSM services
//   GEO_PROVIDER=off   no network calls; every trip is created for manual entry
//   NOMINATIM_URL / OSRM_URL  point at a self-hosted instance instead
// A paid provider (Google, Mapbox) slots in as another `GeoProvider` selected
// by GEO_PROVIDER; nothing outside this file knows which one is live.
//
// FAILURE IS EXPLICIT. If any address in a route cannot be geocoded, the
// distance is null and the caller flags the trip for manual entry. There is no
// "best guess" — a guessed mileage figure on a tax record is worse than a
// blank one the owner knows to fill in.
// ─────────────────────────────────────────────────────────────────────────────

import { business } from './business';
import { cacheGeocode, cachedGeocode } from './repo/mileage';

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

export interface GeoProvider {
  name: string;
  geocode(address: string): Promise<GeoPoint | null>;
  /** Driving distance in miles through the points in order, or null. */
  drivingMiles(points: GeoPoint[]): Promise<number | null>;
}

const METERS_PER_MILE = 1609.344;

// ── Politeness: one request per second, across both services ─────────────────

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
const MIN_GAP_MS = 1100;

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

function userAgent(): string {
  const contact = process.env.BUSINESS_EMAIL || business.email;
  return `MountOlympusDetailing/1.0 (mileage log; ${contact})`;
}

async function getJson(url: string): Promise<unknown> {
  return throttled(async () => {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
    return res.json();
  });
}

// ── OpenStreetMap ────────────────────────────────────────────────────────────

const osm: GeoProvider = {
  name: 'osm',

  async geocode(address) {
    const base = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
    const url = `${base}/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
    const rows = (await getJson(url)) as { lat: string; lon: string; display_name?: string }[];
    const hit = Array.isArray(rows) ? rows[0] : undefined;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, label: hit.display_name ?? '' };
  },

  async drivingMiles(points) {
    if (points.length < 2) return null;
    const base = process.env.OSRM_URL || 'https://router.project-osrm.org';
    const coords = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const data = (await getJson(`${base}/route/v1/driving/${coords}?overview=false`)) as {
      code?: string;
      routes?: { distance: number }[];
    };
    const meters = data.code === 'Ok' ? data.routes?.[0]?.distance : undefined;
    return typeof meters === 'number' && Number.isFinite(meters) ? meters / METERS_PER_MILE : null;
  },
};

const PROVIDERS: Record<string, GeoProvider> = { osm };

export function geoProvider(): GeoProvider | null {
  const name = (process.env.GEO_PROVIDER || 'osm').toLowerCase();
  if (name === 'off' || name === 'none') return null;
  return PROVIDERS[name] ?? osm;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Case/space/punctuation-insensitive key, so "101 E Glade Rd." and "101 e glade rd" share a cache row. */
export function normaliseAddress(address: string): string {
  return address.toLowerCase().replace(/[.#]/g, '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

export async function geocode(address: string): Promise<GeoPoint | null> {
  const key = normaliseAddress(address);
  if (!key) return null;
  const hit = cachedGeocode(key);
  if (hit) return hit;

  const provider = geoProvider();
  if (!provider) return null;
  const point = await provider.geocode(address);
  if (point) cacheGeocode(key, point, provider.name);
  return point;
}

export type RouteResult =
  | { ok: true; milesTenths: number }
  | { ok: false; reason: string };

/**
 * Driving miles through `addresses` in order (base → job1 → job2 → base),
 * rounded to a tenth. Never throws: a network or lookup failure comes back as
 * a reason the owner can read on the trip.
 */
export async function routeMiles(addresses: string[]): Promise<RouteResult> {
  const provider = geoProvider();
  if (!provider) return { ok: false, reason: 'Distance lookup is switched off — enter the miles.' };
  if (addresses.length < 2 || addresses.some((a) => !a.trim())) {
    return { ok: false, reason: 'An address is missing — enter the miles.' };
  }

  try {
    const points: GeoPoint[] = [];
    for (const address of addresses) {
      const point = await geocode(address);
      if (!point) return { ok: false, reason: `Could not find "${address}" on the map — enter the miles.` };
      points.push(point);
    }
    const miles = await provider.drivingMiles(points);
    if (miles === null) return { ok: false, reason: 'No driving route was found — enter the miles.' };
    return { ok: true, milesTenths: Math.round(miles * 10) };
  } catch (e) {
    console.error('[geo] route lookup failed', e);
    return { ok: false, reason: 'The map service did not answer — try Recalculate, or enter the miles.' };
  }
}

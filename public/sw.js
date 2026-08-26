// ─────────────────────────────────────────────────────────────────────────────
// Service worker — hand-written, no Workbox (zero new dependencies, per the
// rest of this project). Runs in its own worker global scope; it has no
// access to the DOM, only `self`, `caches`, `indexedDB`, and `fetch`.
//
// STRATEGY SUMMARY (see the `fetch` listener for the actual routing):
//   navigations        → network-first, timeboxed, falling back to cache
//                         then to /offline.html
//   /_next/static/*     → cache-first — filenames are content-hashed, so a
//                         cache hit is *always* correct and never goes stale
//   images               → stale-while-revalidate, cache trimmed to a bound
//   /api/* (GET)         → network-first with a cache fallback, stamping a
//                         header so the UI can flag data as possibly stale
//   everything else (GET) → cache-first (icons, manifest, offline page)
//   non-GET               → always passes straight through, untouched
//   /api/auth/*            → always passes straight through, untouched
//
// WHAT NEVER GETS CACHED, AND WHY (see `shouldBypassCache`):
//   • /api/auth/* — login/logout/session endpoints must always hit the real
//     server; serving a cached auth response could let someone act as an
//     already-logged-out session, or hide a fresh permission change.
//   • requests carrying an Authorization header — the Cache API has no idea
//     "who" a cached response belongs to. A cached response for one user's
//     credential could otherwise be replayed to a different caller who
//     happens to hit the same URL.
//   • responses with Set-Cookie — caching a session-mutating response and
//     replaying it later would resend a stale cookie. (Browsers already
//     strip Set-Cookie from script-visible fetch() Headers as a forbidden
//     response-header name, so this is mostly a defensive/forward-compatible
//     check — but it costs nothing to keep.)
//   • non-ok responses — never let a 404/500 poison the cache for the next
//     visitor of that URL.
//   • opaque responses — a `no-cors` cross-origin response with status 0 and
//     no readable headers; we can't tell success from failure, so we don't
//     keep it.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// Bump this on every deploy that should invalidate old caches. Every cache
// name below is derived from it, so changing VERSION is the *entire*
// mechanism for cache-busting — `activate` deletes anything not in the
// current set.
const VERSION = 'v1';

const SHELL_CACHE = `mod-shell-${VERSION}`;
const STATIC_CACHE = `mod-static-${VERSION}`;
const IMAGE_CACHE = `mod-images-${VERSION}`;
const API_CACHE = `mod-api-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, STATIC_CACHE, IMAGE_CACHE, API_CACHE];

const OFFLINE_URL = '/offline.html';

// Everything here is a same-origin asset we control, so `cache.addAll` — which
// fails the whole install on any single 404 — is safe to rely on.
const PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  '/icons/favicon-16.png',
];

const NETWORK_TIMEOUT_MS = 4000;
const IMAGE_CACHE_MAX_ENTRIES = 60;
const API_CACHE_MAX_ENTRIES = 40;

// ── Install / activate ──────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
      // Move to "waiting" → "active" immediately rather than waiting for every
      // open tab of the previous version to close. ServiceWorkerRegistrar.tsx
      // pairs this with an "Update available" toast: the *user* decides when
      // to actually pick up the new version (via a SKIP_WAITING message),
      // this just means the new worker is ready the instant they do.
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('mod-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// ── Cache admission guard ────────────────────────────────────────────────────

function isAuthRoute(url) {
  return url.pathname.startsWith('/api/auth/');
}

/** See the file-header comment for the reasoning behind each check. */
function shouldBypassCache(request, response) {
  if (request.headers.has('Authorization')) return true;
  if (!response || !response.ok) return true;
  if (response.type === 'opaque') return true;
  if (response.headers.has('Set-Cookie')) return true;
  return false;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Evicts the oldest entries once a cache passes `maxEntries`. The Cache API
 * iterates `keys()` in insertion order, so the front of the list is the
 * oldest — a cheap FIFO bound without tracking timestamps ourselves.
 */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  if (excess <= 0) return;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

// ── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (!shouldBypassCache(request, response)) cache.put(request, response.clone());
  return response;
}

async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (!shouldBypassCache(request, response)) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    // Precache somehow missing the offline page — last-resort inline reply
    // rather than letting the browser show its own disconnected error page.
    return new Response('Offline and no cached page available.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (!shouldBypassCache(request, response)) {
        cache.put(request, response.clone());
        trimCache(cacheName, maxEntries);
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // Return the cached copy immediately; the network fetch above still runs
    // and refreshes the cache in the background for next time.
    return cached;
  }
  const fresh = await networkPromise;
  return fresh || new Response('', { status: 504, statusText: 'Offline' });
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (!shouldBypassCache(request, response)) {
      cache.put(request, response.clone());
      trimCache(API_CACHE, API_CACHE_MAX_ENTRIES);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (!cached) throw err;

    // Wrap the cached response with a marker header so client code can show
    // a "you're viewing saved data" indicator. Headers are immutable on an
    // existing Response, so this means building a new one around the same
    // body/status rather than mutating `cached` in place.
    const headers = new Headers(cached.headers);
    headers.set('X-From-Cache', 'true');
    headers.set('X-Cache-Date', cached.headers.get('date') || '');
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }
}

function isImageRequest(request, url) {
  return request.destination === 'image' || url.pathname.startsWith('/_next/image');
}

// ── Routing ──────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Non-GET (POST/PUT/PATCH/DELETE) always passes straight through — none of
  // these strategies apply to a mutation, and caching one would be actively
  // wrong. Failed POSTs are handled separately, by the app enqueuing them for
  // Background Sync (see the queue section below) rather than by this
  // listener intercepting them.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no cross-origin requests expected under this app's CSP; don't intercept if one shows up
  if (isAuthRoute(url)) return; // see file header — auth endpoints are never cached, never intercepted

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isImageRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, IMAGE_CACHE_MAX_ENTRIES));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  // Everything else same-origin GET: manifest, /icons/*, offline.html fetched
  // directly, etc.
  event.respondWith(cacheFirst(request, SHELL_CACHE));
});

// ─────────────────────────────────────────────────────────────────────────────
// Offline write queue (Background Sync)
//
// SCHEMA CONTRACT: app code that wants a failed POST retried automatically
// (booking submissions, job-photo metadata, chat messages) writes a record
// into the `requests` object store of the `mod-offline-queue` IndexedDB
// database:
//
//   { url: string, method: string, headers: Record<string,string>,
//     body: string, createdAt: string }
//
// (`id` is assigned by IndexedDB's auto-increment key — don't set it.) Then
// calls `registration.sync.register('mod-sync-queue')`. This file owns
// reading and draining that store; it does not own writing to it — that
// happens from the page, at the point a `fetch()` for one of those POSTs
// throws (offline) so it belongs with the form submission logic, not here.
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_TAG = 'mod-sync-queue';
const QUEUE_DB_NAME = 'mod-offline-queue';
const QUEUE_DB_VERSION = 1;
const QUEUE_STORE = 'requests';

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueGetAll() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueDelete(id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function drainQueue() {
  let items;
  try {
    items = await queueGetAll();
  } catch (err) {
    console.error('[sw] could not read offline queue', err);
    return;
  }

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method || 'POST',
        headers: item.headers || { 'Content-Type': 'application/json' },
        body: item.body,
      });
      // Only dequeue on a genuine success. A network error keeps it queued
      // for the next sync event (right call); a 4xx/5xx also keeps it queued
      // rather than silently discarding someone's booking or message — the
      // alternative (dropping on any non-2xx) risks losing user data over a
      // transient server error.
      if (response.ok) await queueDelete(item.id);
    } catch (err) {
      // Still offline, or the request itself failed to go out at all. Stop
      // processing the rest of the queue now rather than burning through
      // every remaining item's timeout back-to-back; the browser will fire
      // another 'sync' event once connectivity is back.
      console.warn('[sw] offline queue item failed, will retry on next sync', err);
      break;
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(drainQueue());
});

// Periodic Background Sync is Chromium-only, requires the PWA be installed,
// and is granted at the browser's discretion based on engagement — most
// installs will never register it. No feature-detection is needed here:
// browsers that don't implement the API simply never dispatch this event, so
// the listener is inherently inert (a no-op) wherever it's unsupported.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(drainQueue());
});

// ── Push notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // Not JSON — treat the raw text as the body so a malformed/legacy
      // payload still produces *some* visible notification instead of none.
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'Mount Olympus Detailing';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/app' },
  };

  await self.registration.showNotification(title, options);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(focusOrOpenClient(targetUrl));
});

async function focusOrOpenClient(targetUrl) {
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;
  const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  const exact = allClients.find((c) => c.url === absoluteUrl);
  if (exact && 'focus' in exact) return exact.focus();

  // No tab already on that exact URL: reuse any open window rather than
  // spawning a new one (more reliable than window.open on a home-screen PWA),
  // then navigate it.
  const anyClient = allClients[0];
  if (anyClient && 'focus' in anyClient) {
    await anyClient.focus();
    if ('navigate' in anyClient) return anyClient.navigate(absoluteUrl);
  }

  return self.clients.openWindow(absoluteUrl);
}

// ── Page ↔ worker messaging ──────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

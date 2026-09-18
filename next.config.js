/** @type {import('next').NextConfig} */

// Security headers. The previous config set none at all.
//
// The CSP allows 'unsafe-inline' for styles because Next.js injects inline
// <style> for critical CSS, and 'unsafe-inline'/'unsafe-eval' for scripts in
// development only. Tighten script-src with a nonce if you later need a
// strict policy.
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  // Unsplash for placeholder imagery — drop this once real photography lives
  // in /public. data: is needed for the inline select-chevron SVG.
  `img-src 'self' data: blob: https://images.unsplash.com`,
  `font-src 'self' data:`,
  // Resend + Twilio are called server-side only, so no host is needed here.
  `connect-src 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  // public/manifest.webmanifest and public/sw.js (registered by
  // components/pwa/ServiceWorkerRegistrar.tsx) are both same-origin, but
  // default-src alone does not cover either of these fetch destinations —
  // omitting them silently blocks PWA installability and the service worker.
  `manifest-src 'self'`,
  `worker-src 'self'`,
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Old Safari (an iPad mini 2 tops out at iOS 12) cannot parse modern syntax
  // such as `?.` / `??`. Next only downlevels OUR code by default; a library
  // shipping that syntax untranspiled crashes the whole bundle there. Route
  // framer-motion through the compiler too, so it is built to the same
  // browser targets (package.json "browserslist").
  transpilePackages: ['framer-motion'],
  // Two `next dev` instances (or a dev server and a `next build`) running
  // against the same project SHARE `.next` and overwrite each other's chunk
  // manifests — the symptom is a stream of 404s for /_next/static/chunks/*.js
  // and a page that renders completely unstyled. Setting NEXT_DIST_DIR gives a
  // second instance its own output directory:
  //     NEXT_DIST_DIR=.next-preview npx next dev -p 3212
  // Defaults to `.next`, so normal use is unchanged.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // A service worker file cached by an intermediary (or the browser's
        // own HTTP cache) is exactly how a shipped update fails to reach
        // users — the browser only ever re-checks /sw.js itself on its own
        // schedule, so a stale copy of THIS file specifically can pin
        // everyone to an old app version indefinitely. no-cache forces a
        // conditional revalidation on every check instead of trusting a
        // cached copy.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          // A script at /sw.js already defaults to root scope ('/') since
          // that's its own directory — this header makes that explicit and
          // future-proofs it: if /sw.js is ever served from a subpath (e.g.
          // behind a rewrite), this is what still lets it control the whole
          // origin, which is what the navigation/API/image routing inside it
          // assumes.
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

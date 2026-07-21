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
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;

import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import { business, siteUrl } from '@/lib/business';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';
import OfflineBanner from '@/components/pwa/OfflineBanner';
import JsReady from '@/components/visual/JsReady';
import './globals.css';

const display = Archivo({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${business.name} — Automotive, Marine & Aviation Detailing`,
    template: `%s · ${business.name}`,
  },
  description:
    'Paint correction, ceramic coating, and full detailing for cars, boats, and aircraft. Instant online estimates across all three industries.',
  keywords: [
    'car detailing',
    'ceramic coating',
    'paint correction',
    'boat detailing',
    'marine detailing',
    'gelcoat restoration',
    'aircraft detailing',
    'aviation dry wash',
    'motorcycle detailing',
    'mobile detailing',
  ],
  openGraph: {
    siteName: business.name,
    title: business.name,
    description:
      'Automotive, marine, and aviation detailing. Instant estimates, no phone tag.',
    type: 'website',
    url: siteUrl,
  },
  robots: {
    // Live at https://mountolympusdetailing.com with real business details
    // (lib/business.ts), so search engines are allowed to index the site.
    index: true,
    follow: true,
  },

  // ── PWA ──
  // Next's metadata API emits the equivalent <link>/<meta> tags itself,
  // preferred here over hand-written <head> tags so they stay consistent with
  // everything else metadata already generates (canonical URLs, OG tags…).
  manifest: '/manifest.webmanifest',
  // "MOD" everywhere a home-screen / installed-app label is read from:
  // application-name (Windows/Edge), the manifest name + short_name, and the
  // iOS apple-mobile-web-app-title below. All four must agree or one platform
  // will label the icon "Mount Olympus Detailing".
  applicationName: 'MOD',
  icons: {
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    // 'black-translucent' draws the app under the iOS status bar, which suits
    // the obsidian (#050505) full-bleed background used throughout the app.
    statusBarStyle: 'black-translucent',
    title: 'MOD',
  },
  // iOS's auto-detection turns any digit-looking string into a tel: link and
  // any date-shaped string into a calendar link — both misfire constantly
  // against reference numbers, VINs, and plain dates in this app's UI.
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#050505',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Lay the page out edge to edge on notched phones. Without this the
  // installed app is inset below the (translucent) status bar, so scrolled
  // content shows through that strip UNBLURRED while the sticky header below
  // it blurs — the "clear band above the banner". With it, env(safe-area-
  // inset-*) is real: the app header pads its top and the tab bar its bottom.
  viewportFit: 'cover',
};

// Apple splash screens (the per-device `apple-touch-startup-image` <link>
// tags, one pre-rendered PNG per iPhone/iPad screen size) are deliberately
// NOT implemented here. They only cover the very first cold-launch frame
// before the page paints, there are 8+ distinct device sizes to generate and
// keep in sync with scripts/generate-icons.mjs, and iOS falls back to a
// perfectly reasonable plain background+icon splash without them. Given the
// size of the rest of this PWA task, this was judged the right thing to skip
// — see the final report for this called out explicitly.

// Uncaught-error beacon → POST /api/client-error. Deliberately ES5 with no
// dependencies and injected `beforeInteractive`, so it runs on any browser
// BEFORE the app bundle — including a browser where that bundle then fails.
// That is the whole point: a device with no dev tools (an old iPad) can still
// tell the server log what went wrong. Capped at five reports per page.
const CLIENT_ERROR_BEACON = `(function(){var n=0;function send(p){if(n++>4)return;try{p.url=location.href;var b=JSON.stringify(p);if(navigator.sendBeacon){navigator.sendBeacon('/api/client-error',new Blob([b],{type:'application/json'}))}else{var x=new XMLHttpRequest();x.open('POST','/api/client-error',true);x.setRequestHeader('Content-Type','application/json');x.send(b)}}catch(e){}}
window.addEventListener('error',function(e){var t=e.target;send({message:String(e.message||(e.error&&e.error.message)||('resource failed: '+((t&&(t.src||t.href))||'')) ),source:String(e.filename||(t&&(t.src||t.href))||''),line:e.lineno||0,col:e.colno||0,stack:String((e.error&&e.error.stack)||'').slice(0,600)})},true);
window.addEventListener('unhandledrejection',function(e){var r=e.reason||{};send({message:'unhandledrejection: '+String(r.message||r),source:'',line:0,col:0,stack:String(r.stack||'').slice(0,600)})});})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="bg-obsidian text-white font-body antialiased">
        <Script id="client-error-beacon" strategy="beforeInteractive">
          {CLIENT_ERROR_BEACON}
        </Script>
        <JsReady />
        <OfflineBanner />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

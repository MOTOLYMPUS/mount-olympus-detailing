import type { Metadata, Viewport } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import { business, siteUrl } from '@/lib/business';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';
import OfflineBanner from '@/components/pwa/OfflineBanner';
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
    // The site publishes placeholder business details and stock imagery, so it
    // is kept out of search indexes until it is genuinely launch-ready. Flip
    // this once lib/business.ts and data/media.ts hold real values.
    index: false,
    follow: false,
  },

  // ── PWA ──
  // Next's metadata API emits the equivalent <link>/<meta> tags itself,
  // preferred here over hand-written <head> tags so they stay consistent with
  // everything else metadata already generates (canonical URLs, OG tags…).
  manifest: '/manifest.webmanifest',
  applicationName: business.name,
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
    title: 'Mt Olympus',
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
};

// Apple splash screens (the per-device `apple-touch-startup-image` <link>
// tags, one pre-rendered PNG per iPhone/iPad screen size) are deliberately
// NOT implemented here. They only cover the very first cold-launch frame
// before the page paints, there are 8+ distinct device sizes to generate and
// keep in sync with scripts/generate-icons.mjs, and iOS falls back to a
// perfectly reasonable plain background+icon splash without them. Given the
// size of the rest of this PWA task, this was judged the right thing to skip
// — see the final report for this called out explicitly.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="bg-obsidian text-white font-body antialiased">
        <OfflineBanner />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

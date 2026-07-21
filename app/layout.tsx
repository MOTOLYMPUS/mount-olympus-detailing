import type { Metadata, Viewport } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import { business, siteUrl } from '@/lib/business';
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
};

export const viewport: Viewport = {
  themeColor: '#050505',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="bg-obsidian text-white font-body antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
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
  title: 'Apex Detailing Atelier — Luxury Paint Correction, Ceramic Coating & PPF',
  description:
    'Certified paint correction, ceramic coating, and paint protection film for Ferrari, Porsche, Lamborghini, McLaren, and the world\'s finest performance vehicles. Instant estimates, real-time booking.',
  keywords: [
    'luxury car detailing',
    'ceramic coating near me',
    'paint correction',
    'Ferrari detailer',
    'Porsche detailing',
    'PPF installation',
    'luxury auto spa',
    'exotic car detailing',
  ],
  openGraph: {
    title: 'Apex Detailing Atelier',
    description: 'Perfection, Preserved. Luxury detailing for vehicles that deserve nothing less.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="bg-obsidian text-white font-body antialiased">{children}</body>
    </html>
  );
}

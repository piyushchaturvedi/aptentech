import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Inter, IBM_Plex_Mono } from 'next/font/google';
import '@/styles/fonts.css';

/**
 * Fonts.
 *
 * The source loaded these from Google Fonts, costing a preconnect plus a render-blocking
 * stylesheet before any text could paint. `next/font` self-hosts the files and inlines the
 * @font-face rules, which removes a third-party round trip from the critical path and lets
 * the CSP drop `fonts.googleapis.com` entirely.
 *
 * The exact families, weights and `display: swap` behaviour are unchanged, and
 * `adjustFontFallback` matches the fallback metrics so swapping does not shift layout.
 */
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aptentech.com'),
  title: { default: 'Aptentech', template: '%s' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2A1F7A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';

import './globals.css';

import { CursorMascot } from '@/components/shell/cursor-mascot';
import { AudioBindings } from '@/components/shell/audio-bindings';
import { SiteHeader } from '@/components/shell/site-header';
import { SiteFooter } from '@/components/shell/site-footer';

// Same type system as the urufu labs launchpad: one UI sans, one display serif
// for big headlines only, one mono for numbers. Font roles live in styles/tokens.css.
const sans = Hanken_Grotesk({
  variable: '--font-hanken',
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin', 'latin-ext'],
});

const display = Instrument_Serif({
  variable: '--font-instrument',
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin', 'latin-ext'],
});

const mono = JetBrains_Mono({
  variable: '--font-jetbrains',
  weight: ['400', '500', '600'],
  subsets: ['latin'],
});

// themeColor matches --bg in styles/tokens.css so the mobile address bar tints with the page.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F3F0' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0C' },
  ],
};

export const metadata: Metadata = {
  title: 'urufulabs studio',
  description: 'Browser-based generative NFT art studio by urufu labs. Compose traits, generate up to 10,000 tokens, publish to IPFS.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <Script src="/theme-bootstrap.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-full flex flex-col">
        <CursorMascot />
        <AudioBindings />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Yusei_Magic, Klee_One, Pixelify_Sans, DotGothic16, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';

import './globals.css';

import { CursorMascot } from '@/components/shell/cursor-mascot';
import { AudioBindings } from '@/components/shell/audio-bindings';
import { SiteHeader } from '@/components/shell/site-header';
import { SiteFooter } from '@/components/shell/site-footer';

const yusei = Yusei_Magic({
  variable: '--font-display',
  weight: '400',
  subsets: ['latin', 'latin-ext'],
});

const klee = Klee_One({
  variable: '--font-round',
  weight: ['400', '600'],
  subsets: ['latin'],
});

const pixel = Pixelify_Sans({
  variable: '--font-pixel',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
});

const dot = DotGothic16({
  variable: '--font-jp',
  weight: '400',
  subsets: ['latin'],
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5ecda' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1a24' },
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
      className={`${yusei.variable} ${klee.variable} ${pixel.variable} ${dot.variable} ${mono.variable} h-full`}
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

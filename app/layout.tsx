import './globals.css';

import type { ReactNode } from 'react';

export const metadata = {
  title: 'neochibi studio by urufu labs',
  description: 'Local trait composition studio for generative PNG art collections.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}

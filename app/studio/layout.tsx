import { notFound } from 'next/navigation';

import { devToolsEnabled } from '@/lib/dev-tools-flag';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  if (!devToolsEnabled()) notFound();
  return children;
}

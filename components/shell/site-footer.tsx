import Link from 'next/link';

import { ThemeToggle } from './theme-toggle';
import { AudioToggle } from './audio-toggle';

/// Cream footer with a dashed anchor top rule + pixel 11px credit line. Small
/// screens surface the theme toggle here since the header hides it under lg.
export function SiteFooter() {
  return (
    <footer
      className="mt-8 px-4 py-4 text-center"
      style={{
        fontFamily: 'var(--font-pixel), monospace',
        fontSize: '11px',
        color: 'var(--anchor)',
        borderTop: '1.5px dashed var(--anchor)',
        background: 'var(--cream)',
      }}
    >
      <nav
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
        style={{ fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 12 }}
        aria-label="footer links"
      >
        <Link href="/studio" className="hover:underline" style={{ color: 'var(--anchor)' }}>✿ studio</Link>
        <a
          href="https://github.com/urufu-labs/neochibi-studio"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          style={{ color: 'var(--anchor)' }}
        >
          ✧ github ↗
        </a>
        <a
          href="https://www.urufulabs.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          style={{ color: 'var(--pink-hot)' }}
        >
          ❋ urufu labs ↗
        </a>
      </nav>
      <div style={{ marginTop: 10 }}>© urufulabs studio ❀ by urufu labs</div>
      <div style={{ marginTop: 4, opacity: 0.7 }}>browser-based generative NFT art (づ｡◕‿‿◕｡)づ</div>

      <div
        className="lg:hidden"
        style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 12 }}
      >
        <ThemeToggle />
        <AudioToggle />
      </div>
    </footer>
  );
}

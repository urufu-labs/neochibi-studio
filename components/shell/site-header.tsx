import Link from 'next/link';

import { ThemeToggle } from './theme-toggle';
import { AudioToggle } from './audio-toggle';
import { MobileNavigation } from './mobile-navigation';

/// Cream-bar header shared across every route. Brand mark `ウ` on a pink-hot
/// circle, name in a display serif, primary nav row (hidden below lg), theme
/// toggle, and a mobile drawer trigger. Structure mirrors urufu-launchpad so
/// the two products read as one family.
export function SiteHeader() {
  return (
    <header
      className="px-3 sm:px-4 py-2 flex items-center justify-between gap-2"
      style={{ borderBottom: '1.5px solid var(--anchor)', background: 'var(--cream)', color: 'var(--anchor)' }}
    >
      <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="urufulabs studio home">
        <span
          aria-hidden
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-base"
          style={{
            background: 'var(--pink-hot)',
            color: '#fff',
            border: '1.5px solid var(--anchor)',
            boxShadow: '2px 2px 0 var(--anchor)',
            fontFamily: 'var(--font-jp), "DotGothic16", monospace',
          }}
        >
          ウ
        </span>
        <span
          className="uru-h1 hidden min-[360px]:inline"
          style={{ fontSize: 'clamp(16px, 4vw, 22px)' }}
        >
          urufulabs<span style={{ color: 'var(--pink-hot)' }}>studio</span>
          <sup style={{ fontFamily: 'var(--font-pixel), monospace', fontSize: '10px', marginLeft: 2 }}>®</sup>
        </span>
      </Link>

      <nav
        className="hidden lg:flex items-center gap-3 text-[13px] justify-end"
        style={{ fontFamily: 'var(--font-round), Klee One, cursive' }}
        aria-label="primary navigation"
      >
        <Link href="/studio" className="hover:underline" style={{ color: 'var(--anchor)' }}>✿ studio</Link>
        <Link href="/how-to" className="hover:underline" style={{ color: 'var(--anchor)' }}>❁ how-to</Link>
        <a
          href="https://www.urufulabs.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          style={{ color: 'var(--pink-hot)' }}
        >
          ❋ urufu labs ↗
        </a>
        <ThemeToggle />
        <AudioToggle />
      </nav>

      <div className="flex lg:hidden items-center gap-2 shrink-0">
        <MobileNavigation />
      </div>
    </header>
  );
}

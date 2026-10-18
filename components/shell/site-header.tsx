'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MobileNavigation } from './mobile-navigation';
import { SettingsMenu } from './settings-menu';
import { IconExternal, IconGithub } from './icons';
import styles from './shell.module.css';

const NAV = [
  { href: '/studio', label: 'Studio' },
  { href: '/how-to', label: 'How it works' },
];

export function isActivePath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

/// Sticky site header. Same shell as the urufu labs launchpad (logo, primary links,
/// right-hand cluster) so the studio reads as part of the same product. Below 1020px
/// the links move into the menu sheet.
export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className={styles.header}>
      <Link href="/studio" className={styles.brand} aria-label="urufulabs studio home">
        <Image src="/brand/logo-64.png" alt="" aria-hidden width={32} height={32} priority className={styles.brandLogo} />
        <span className={styles.brandName}>
          urufu<b>labs</b>
        </span>
        <span className={styles.brandTag}>studio</span>
      </Link>

      <nav className={styles.nav} aria-label="Primary">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={styles.navLink} aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className={styles.right}>
        <a href="https://www.urufulabs.xyz" target="_blank" rel="noopener noreferrer" className={`${styles.pill} ${styles.hideSm}`}>
          Launchpad <IconExternal />
        </a>
        <a
          href="https://github.com/urufu-labs/neochibi-studio"
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.pill} ${styles.iconPill} ${styles.hideSm}`}
          aria-label="Source on GitHub"
          title="Source on GitHub"
        >
          <IconGithub />
        </a>
        <span className={styles.hideSm}>
          <SettingsMenu />
        </span>
        <MobileNavigation />
      </div>
    </header>
  );
}

import Image from 'next/image';
import Link from 'next/link';

import styles from './shell.module.css';

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string; external?: boolean }> }> = [
  {
    title: 'Studio',
    links: [
      { href: '/studio', label: 'Open the studio' },
      { href: '/how-to', label: 'How it works' },
      { href: 'https://github.com/urufu-labs/neochibi-studio', label: 'Source on GitHub', external: true },
    ],
  },
  {
    title: 'urufu',
    links: [
      { href: 'https://www.urufulabs.xyz', label: 'Launchpad', external: true },
      { href: 'https://www.urufu.xyz', label: 'urufu gemu', external: true },
      { href: 'https://x.com/urugemu', label: 'X', external: true },
      { href: 'https://discord.gg/urufugemu', label: 'Discord', external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <Link href="/studio" className={styles.brand} aria-label="urufulabs studio home">
            <Image src="/brand/logo-64.png" alt="" aria-hidden width={28} height={28} className={styles.brandLogo} />
            <span className={styles.brandName}>
              urufu<b>labs</b>
            </span>
            <span className={styles.brandTag}>studio</span>
          </Link>
          <p>
            Build a generative NFT collection in your browser. Stack trait layers, set rarities and rules,
            render up to 10,000 tokens on your device, then publish to IPFS and launch on urufu labs.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} className={styles.footerCol} aria-label={col.title}>
            <h3>{col.title}</h3>
            <ul>
              {col.links.map((l) => (
                <li key={l.href}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noopener noreferrer">
                      {l.label} ↗
                    </a>
                  ) : (
                    <Link href={l.href}>{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className={styles.footerBase}>
        <span>© {new Date().getFullYear()} urufu labs</span>
        <span>Everything renders on your device. Nothing is uploaded until you publish.</span>
      </div>
    </footer>
  );
}

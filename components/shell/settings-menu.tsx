'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { isAudioEnabled, playSfx, setAudioEnabled } from '@/lib/audio/sfx';
import { Menu } from './menu';
import { applyTheme, currentAppliedTheme, type Theme } from './theme-toggle';
import { CURSOR_EVENT, isCursorMascotOn, setCursorMascotOn } from './cursor-mascot';
import { IconExternal, IconSettings } from './icons';
import styles from './shell.module.css';

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="ui-switch"
      data-sfx="none"
      onClick={() => onChange(!on)}
    />
  );
}

/// Header settings: theme, sound, cursor buddy, plus the less-used links.
export function SettingsMenu() {
  const [theme, setTheme] = useState<Theme>('light');
  const [sound, setSound] = useState(false);
  const [cursor, setCursor] = useState(false);

  useEffect(() => {
    setTheme(currentAppliedTheme());
    setSound(isAudioEnabled());
    setCursor(isCursorMascotOn());
    const syncSound = () => setSound(isAudioEnabled());
    const syncCursor = () => setCursor(isCursorMascotOn());
    const mo = new MutationObserver(() => setTheme(currentAppliedTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('neochibi-audio-toggle', syncSound);
    window.addEventListener(CURSOR_EVENT, syncCursor);
    return () => {
      mo.disconnect();
      window.removeEventListener('neochibi-audio-toggle', syncSound);
      window.removeEventListener(CURSOR_EVENT, syncCursor);
    };
  }, []);

  return (
    <Menu
      label="Settings"
      width={260}
      trigger={() => (
        <button type="button" className={`${styles.pill} ${styles.iconPill}`} aria-label="Settings" title="Settings">
          <IconSettings />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="ui-menu-label">Display</div>
          <div className={styles.setRow}>
            <span>Dark mode</span>
            <Switch
              label="Dark mode"
              on={theme === 'dark'}
              onChange={(v) => {
                applyTheme(v ? 'dark' : 'light');
                setTheme(v ? 'dark' : 'light');
              }}
            />
          </div>
          <div className={styles.setRow}>
            <span>
              Sound effects
              <small>clicks and chimes</small>
            </span>
            <Switch
              label="Sound effects"
              on={sound}
              onChange={(v) => {
                setAudioEnabled(v);
                setSound(v);
                if (v) playSfx('coin');
              }}
            />
          </div>
          <div className={styles.setRow}>
            <span>
              Cursor buddy
              <small>a tiny wolf follows your cursor</small>
            </span>
            <Switch
              label="Cursor buddy"
              on={cursor}
              onChange={(v) => {
                setCursorMascotOn(v);
                setCursor(v);
              }}
            />
          </div>
          <div className="ui-menu-sep" />
          <Link href="/how-to" className="ui-menu-item" onClick={close}>How it works</Link>
          <a href="https://github.com/urufu-labs/neochibi-studio" target="_blank" rel="noopener noreferrer" className="ui-menu-item">
            Source on GitHub <small><IconExternal /></small>
          </a>
          <div className="ui-menu-sep" />
          <a href="https://www.urufulabs.xyz" target="_blank" rel="noopener noreferrer" className="ui-menu-item">
            urufu labs launchpad <small><IconExternal /></small>
          </a>
          <a href="https://www.urufu.xyz" target="_blank" rel="noopener noreferrer" className="ui-menu-item">
            urufu gemu <small><IconExternal /></small>
          </a>
        </>
      )}
    </Menu>
  );
}

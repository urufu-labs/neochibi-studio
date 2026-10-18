'use client';

import { useEffect, useState } from 'react';

/// Light/dark theme toggle. Persists in localStorage under `neochibi-theme` and applies the
/// value as a `data-theme` attribute on <html>. Light is the default; the OS
/// `prefers-color-scheme` is ignored (see public/theme-bootstrap.js).

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'neochibi-theme';

export function currentAppliedTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'dark' ? 'dark' : 'light';
}

export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {}
}

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);
const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(currentAppliedTheme());
  }, []);

  const handleClick = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  if (!mounted) {
    // Keep the first client render identical to the server markup.
    return (
      <button type="button" aria-label="Toggle theme" className="ui-icon-btn">
        <MoonIcon />
      </button>
    );
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="ui-icon-btn"
      data-sfx="none"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

'use client';

import { useEffect, useState } from 'react';

/// Light/dark theme toggle. Persists in localStorage under `neochibi-theme` and applies the
/// value as a `data-theme` attribute on <html>. Also honours the OS `prefers-color-scheme`
/// on first load so someone already in dark mode elsewhere doesn't get flashed with light.
///
/// The initial paint happens via /theme-bootstrap.js in layout.tsx so there's no FOUC
/// between server-rendered HTML and the client theme.

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'neochibi-theme';

function currentAppliedTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'dark' ? 'dark' : 'light';
}

function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {}
}

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
    return (
      <button type="button" aria-label="Toggle theme" style={toggleStyle(false)}>
        ☼
      </button>
    );
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'switch to light mode' : 'switch to dark mode'}
      style={toggleStyle(isDark)}
      data-sfx="none"
    >
      {isDark ? '☾' : '☼'}
    </button>
  );
}

function toggleStyle(isDark: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    background: isDark ? 'var(--mizuiro)' : 'var(--yolk)',
    color: 'var(--anchor)',
    border: '1.5px solid var(--anchor)',
    boxShadow: '2px 2px 0 var(--anchor)',
    fontFamily: 'var(--font-pixel), monospace',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
  };
}

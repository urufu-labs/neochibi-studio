'use client';

import { useEffect, useState } from 'react';

import { isAudioEnabled, setAudioEnabled } from '@/lib/audio/sfx';

/// Ambient SFX opt-in toggle. Reads/writes `localStorage['neochibi-audio']`
/// through the sfx module so state is shared with AudioBindings and any
/// direct playSfx() consumer. Icon-only square to sit beside ThemeToggle.

export function AudioToggle() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEnabled(isAudioEnabled());
    const onChange = () => setEnabled(isAudioEnabled());
    window.addEventListener('neochibi-audio-toggle', onChange as EventListener);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('neochibi-audio-toggle', onChange as EventListener);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const handleClick = () => {
    const next = !enabled;
    setAudioEnabled(next);
    setEnabled(next);
  };

  if (!mounted) {
    return (
      <button type="button" aria-label="Toggle audio" style={toggleStyle(false)}>
        ♪
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={enabled ? 'Mute ambient audio' : 'Enable ambient audio'}
      aria-pressed={enabled}
      title={enabled ? 'mute ambient audio' : 'enable ambient audio'}
      style={toggleStyle(enabled)}
      data-sfx="none"
    >
      {enabled ? '♪' : '♪̸'}
    </button>
  );
}

function toggleStyle(enabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    background: enabled ? 'var(--mint)' : 'var(--cream-deep)',
    color: 'var(--anchor)',
    border: '1.5px solid var(--anchor)',
    boxShadow: '2px 2px 0 var(--anchor)',
    fontFamily: 'var(--font-pixel), monospace',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
  };
}

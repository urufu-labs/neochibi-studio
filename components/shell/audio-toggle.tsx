'use client';

import { useEffect, useState } from 'react';

import { isAudioEnabled, setAudioEnabled } from '@/lib/audio/sfx';

/// Ambient SFX opt-in toggle. Reads/writes `localStorage['neochibi-audio']`
/// through the sfx module so state is shared with AudioBindings and the
/// settings menu. Icon-only square to sit beside ThemeToggle.

const SoundOn = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
);
const SoundOff = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m16 9 5 6M21 9l-5 6" /></svg>
);

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
      <button type="button" aria-label="Toggle audio" className="ui-icon-btn">
        <SoundOff />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={enabled ? 'Mute sound effects' : 'Turn on sound effects'}
      aria-pressed={enabled}
      title={enabled ? 'Mute sound effects' : 'Turn on sound effects'}
      className="ui-icon-btn"
      data-sfx="none"
    >
      {enabled ? <SoundOn /> : <SoundOff />}
    </button>
  );
}

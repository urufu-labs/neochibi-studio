'use client';

import { useEffect, useRef, useState } from 'react';
import type { TraitAsset, TraitLayer, TraitLibrary } from '../lib/art-generator/types';

interface TraitPickerProps {
  layer: TraitLayer;
  library: TraitLibrary;
  value: string;
  onChange: (traitId: string) => void;
  buildAssetUrl: (rootDir: string, asset: TraitAsset) => string;
}

export function TraitPicker({ layer, library, value, onChange, buildAssetUrl }: TraitPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = layer.traits.find((trait) => trait.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function pick(traitId: string) {
    onChange(traitId);
    setOpen(false);
  }

  return (
    <div className="trait-picker" ref={rootRef}>
      <button
        type="button"
        className={`trait-picker-button${open ? ' trait-picker-button-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="trait-picker-thumb">
          {selected ? (() => {
            const src = buildAssetUrl(library.rootDir, selected);
            return src ? <img alt={selected.name} src={src} /> : <span className="trait-picker-thumb-empty">…</span>;
          })() : (
            <span className="trait-picker-thumb-empty">—</span>
          )}
        </span>
        <span className="trait-picker-label">{selected ? selected.name : 'None'}</span>
        <span className="trait-picker-chevron" aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="trait-picker-popover" role="listbox" aria-label={`${layer.name} trait`}>
          <button
            type="button"
            className={`trait-picker-option${value === '' ? ' trait-picker-option-active' : ''}`}
            onClick={() => pick('')}
            role="option"
            aria-selected={value === ''}
          >
            <span className="trait-picker-thumb trait-picker-thumb-small">
              <span className="trait-picker-thumb-empty">—</span>
            </span>
            <span>None</span>
          </button>
          {layer.traits.map((trait) => {
            const src = buildAssetUrl(library.rootDir, trait);
            return (
              <button
                key={trait.id}
                type="button"
                className={`trait-picker-option${value === trait.id ? ' trait-picker-option-active' : ''}`}
                onClick={() => pick(trait.id)}
                role="option"
                aria-selected={value === trait.id}
              >
                <span className="trait-picker-thumb trait-picker-thumb-small">
                  {src ? <img alt={trait.name} src={src} /> : <span className="trait-picker-thumb-empty">…</span>}
                </span>
                <span>{trait.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

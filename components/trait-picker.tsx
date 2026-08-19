'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TraitAsset, TraitLayer, TraitLibrary } from '../lib/art-generator/types';

interface TraitPickerProps {
  layer: TraitLayer;
  library: TraitLibrary;
  value: string;
  onChange: (traitId: string) => void;
  buildAssetUrl: (rootDir: string, asset: TraitAsset) => string;
}

// Windowed row rendering. Real height is set from the first mounted option;
// this is the fallback so the very first render doesn't collapse to zero.
const ROW_HEIGHT_ESTIMATE = 40;
const OVERSCAN = 8;
const POPOVER_MAX_HEIGHT = 320;

export function TraitPicker({ layer, library, value, onChange, buildAssetUrl }: TraitPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [rowHeight, setRowHeight] = useState(ROW_HEIGHT_ESTIMATE);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const firstRowRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [open]);

  // Measure the first rendered row so the window math matches actual CSS.
  useEffect(() => {
    if (!open || !firstRowRef.current) return;
    const measured = firstRowRef.current.getBoundingClientRect().height;
    if (measured > 0 && Math.abs(measured - rowHeight) > 0.5) setRowHeight(measured);
  }, [open, rowHeight, query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return layer.traits;
    return layer.traits.filter((trait) => trait.name.toLowerCase().includes(q));
  }, [layer.traits, query]);

  function pick(traitId: string) {
    onChange(traitId);
    setOpen(false);
  }

  const totalHeight = filtered.length * rowHeight;
  const viewportHeight = POPOVER_MAX_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const endIndex = Math.min(
    filtered.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN,
  );
  const visible = filtered.slice(startIndex, endIndex);
  const topPad = startIndex * rowHeight;

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
            return src ? <img alt={selected.name} src={src} loading="lazy" decoding="async" /> : <span className="trait-picker-thumb-empty">…</span>;
          })() : (
            <span className="trait-picker-thumb-empty">—</span>
          )}
        </span>
        <span className="trait-picker-label">{selected ? selected.name : 'None'}</span>
        <span className="trait-picker-chevron" aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="trait-picker-popover" role="listbox" aria-label={`${layer.name} trait`}>
          {layer.traits.length > 20 ? (
            <input
              type="search"
              className="trait-picker-search"
              placeholder={`Search ${layer.traits.length.toLocaleString()} traits…`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setScrollTop(0);
                if (listRef.current) listRef.current.scrollTop = 0;
              }}
              autoFocus
            />
          ) : null}
          <div
            ref={listRef}
            className="trait-picker-scroll"
            style={{ maxHeight: viewportHeight, overflowY: 'auto' }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
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
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ transform: `translateY(${topPad}px)` }}>
                {visible.map((trait, i) => {
                  const src = buildAssetUrl(library.rootDir, trait);
                  const isFirst = i === 0;
                  return (
                    <button
                      ref={isFirst ? firstRowRef : undefined}
                      key={trait.id}
                      type="button"
                      className={`trait-picker-option${value === trait.id ? ' trait-picker-option-active' : ''}`}
                      onClick={() => pick(trait.id)}
                      role="option"
                      aria-selected={value === trait.id}
                    >
                      <span className="trait-picker-thumb trait-picker-thumb-small">
                        {src ? <img alt={trait.name} src={src} loading="lazy" decoding="async" /> : <span className="trait-picker-thumb-empty">…</span>}
                      </span>
                      <span>{trait.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="trait-picker-empty">No traits match “{query}”.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyPreviewEffectPreset,
  DEFAULT_PREVIEW_EFFECTS,
  EFFECT_DEF_BY_ID,
  hasPixelatedEffect,
  normalizePreviewEffects,
  PREVIEW_EFFECT_PRESETS,
  renderForegroundEffectsComposite,
  type PreviewEffect,
} from '../lib/art-generator/canvas-filters';
import type { TraitAsset, TraitLayer, TraitLibrary } from '../lib/art-generator/types';

interface PreviewLayerInput {
  layer: TraitLayer;
  trait: TraitAsset;
}

interface PreviewCanvasProps {
  library: TraitLibrary | null;
  previewLayers: PreviewLayerInput[];
  effects: PreviewEffect[];
  onEffectsChange: (effects: PreviewEffect[]) => void;
  exportName: string;
  onExportNameChange: (name: string) => void;
  buildAssetUrl: (rootDir: string, asset: TraitAsset) => string;
}

interface ToolbarState {
  loading: boolean;
  error: string | null;
  success: string | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function buildExportFileName(name: string): string {
  const trimmed = name.trim() || 'neochibi-preview';
  return trimmed.toLowerCase().endsWith('.png') ? trimmed : `${trimmed}.png`;
}

function isBackgroundLayer(layer: TraitLayer): boolean {
  return layer.id === 'background' || layer.directoryName === 'background' || layer.name.toLowerCase() === 'background';
}

export function PreviewCanvas({
  library,
  previewLayers,
  effects,
  onEffectsChange,
  exportName,
  onExportNameChange,
  buildAssetUrl,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositeTokenRef = useRef(0);
  const renderRafRef = useRef<number | null>(null);
  const previewLayersRef = useRef(previewLayers);
  previewLayersRef.current = previewLayers;
  const buildAssetUrlRef = useRef(buildAssetUrl);
  buildAssetUrlRef.current = buildAssetUrl;
  const [compositeRev, setCompositeRev] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [toolbar, setToolbar] = useState<ToolbarState>({ loading: false, error: null, success: null });

  const pixelated = hasPixelatedEffect(effects);

  const compositeKey = useMemo(
    () =>
      previewLayers
        .map(({ layer, trait }) => `${layer.id}:${trait.id}@${trait.version ?? 0}`)
        .join('|'),
    [previewLayers],
  );

  useEffect(() => {
    compositeTokenRef.current += 1;
    const token = compositeTokenRef.current;
    const layers = previewLayersRef.current;

    if (!library || layers.length === 0) {
      backgroundCanvasRef.current = null;
      foregroundCanvasRef.current = null;
      setCompositeRev((rev) => rev + 1);
      return;
    }

    void (async () => {
      try {
        const loaded = await Promise.all(
          layers.map(({ trait }) => loadImage(buildAssetUrlRef.current(library.rootDir, trait))),
        );
        if (token !== compositeTokenRef.current) return;

        const width = Math.max(...loaded.map((img) => img.naturalWidth || 1024), 1024);
        const height = Math.max(...loaded.map((img) => img.naturalHeight || 1024), 1024);

        const background = backgroundCanvasRef.current ?? document.createElement('canvas');
        background.width = width;
        background.height = height;
        const backgroundCtx = background.getContext('2d');
        if (!backgroundCtx) throw new Error('Canvas 2D context unavailable.');
        backgroundCtx.clearRect(0, 0, width, height);

        const foreground = foregroundCanvasRef.current ?? document.createElement('canvas');
        foreground.width = width;
        foreground.height = height;
        const foregroundCtx = foreground.getContext('2d');
        if (!foregroundCtx) throw new Error('Canvas 2D context unavailable.');
        foregroundCtx.clearRect(0, 0, width, height);

        loaded.forEach((img, index) => {
          const targetCtx = isBackgroundLayer(layers[index].layer) ? backgroundCtx : foregroundCtx;
          targetCtx.drawImage(img, 0, 0, width, height);
        });

        backgroundCanvasRef.current = background;
        foregroundCanvasRef.current = foreground;
        setRenderError(null);
        setCompositeRev((rev) => rev + 1);
      } catch (err) {
        if (token !== compositeTokenRef.current) return;
        setRenderError(err instanceof Error ? err.message : 'Failed to render preview.');
      }
    })();
  }, [library, compositeKey]);

  useEffect(() => {
    if (renderRafRef.current !== null) cancelAnimationFrame(renderRafRef.current);
    renderRafRef.current = requestAnimationFrame(() => {
      renderRafRef.current = null;
      const canvas = canvasRef.current;
      const background = backgroundCanvasRef.current;
      const foreground = foregroundCanvasRef.current;
      if (!canvas) return;

      if (!background && !foreground) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      try {
        renderForegroundEffectsComposite(canvas, background, foreground, effects);
        setRenderError(null);
      } catch (err) {
        setRenderError(err instanceof Error ? err.message : 'Failed to render preview.');
      }
    });

    return () => {
      if (renderRafRef.current !== null) {
        cancelAnimationFrame(renderRafRef.current);
        renderRafRef.current = null;
      }
    };
  }, [compositeRev, effects]);

  function updateEffect(id: string, patch: Partial<PreviewEffect>) {
    const next = effects.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
    onEffectsChange(normalizePreviewEffects(next));
  }

  function updateEffectOption(id: string, key: string, value: number) {
    const next = effects.map((entry) =>
      entry.id === id ? { ...entry, options: { ...(entry.options ?? {}), [key]: value } } : entry,
    );
    onEffectsChange(normalizePreviewEffects(next));
  }

  function moveEffect(id: string, direction: -1 | 1) {
    const index = effects.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= effects.length) return;
    const next = [...effects];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onEffectsChange(normalizePreviewEffects(next));
  }

  function resetEffects() {
    onEffectsChange([...DEFAULT_PREVIEW_EFFECTS]);
  }

  async function exportPreview() {
    const canvas = canvasRef.current;
    if (!canvas || previewLayers.length === 0) {
      setToolbar({ loading: false, error: 'Select traits before exporting.', success: null });
      return;
    }
    setToolbar({ loading: true, error: null, success: null });
    try {
      const fileName = buildExportFileName(exportName);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = fileName;
      link.click();
      setToolbar({ loading: false, error: null, success: `Exported ${fileName}.` });
    } catch (err) {
      setToolbar({ loading: false, error: err instanceof Error ? err.message : 'Failed to export preview.', success: null });
    }
  }

  async function copyPreview() {
    const canvas = canvasRef.current;
    if (!canvas || previewLayers.length === 0) {
      setToolbar({ loading: false, error: 'Select traits before copying.', success: null });
      return;
    }
    setToolbar({ loading: true, error: null, success: null });
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('Clipboard image copy is not supported in this browser.');
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode preview as PNG.');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setToolbar({ loading: false, error: null, success: 'Copied preview to clipboard.' });
    } catch (err) {
      setToolbar({ loading: false, error: err instanceof Error ? err.message : 'Failed to copy preview.', success: null });
    }
  }

  const activeCount = effects.filter((e) => e.enabled).length;

  return (
    <section className="panel panel-preview">
      <div className="panel-header panel-header-preview panel-header-tight">
        <h2>Preview</h2>
        <div className="preview-stat-chip">
          {previewLayers.length > 0 ? `${previewLayers.length} live layers` : 'Stage empty'}
          {activeCount > 0 ? ` · ${activeCount} fx` : ''}
        </div>
      </div>

      <div className="preview-stage">
        {previewLayers.length === 0 ? (
          <div className="preview-empty">
            <p>No preview yet.</p>
            <span>Select a root directory and choose traits to render the stack.</span>
          </div>
        ) : (
          <canvas ref={canvasRef} className={`preview-canvas-el${pixelated ? ' preview-canvas-pixelated' : ''}`} />
        )}
      </div>

      <div className="preview-toolbar">
        <label className="field-group" htmlFor="export-name-input">
          <span>PNG export name</span>
          <input
            id="export-name-input"
            onChange={(event) => onExportNameChange(event.target.value)}
            placeholder="character-preview"
            type="text"
            value={exportName}
          />
        </label>
        <div className="preview-toolbar-actions">
          <button className="secondary-button small-button" onClick={() => void copyPreview()} type="button" disabled={toolbar.loading || previewLayers.length === 0}>
            Copy preview
          </button>
          <button className="primary-button small-button" onClick={() => void exportPreview()} type="button" disabled={toolbar.loading || previewLayers.length === 0}>
            Export PNG
          </button>
        </div>
      </div>

      <div className="effect-chip-stack">
        <div className="effect-chip-head">
          <h3>Effects</h3>
          <div className="effect-chip-head-actions">
            <span className="effect-chip-count">{activeCount}/{effects.length} on</span>
            <button className="secondary-button small-button" onClick={resetEffects} type="button" disabled={activeCount === 0}>
              Reset effects
            </button>
          </div>
        </div>
        <p className="effect-chip-hint">Toggle and reorder — effects apply to the live canvas in list order, and bake into Copy/Export PNG.</p>
        <div className="effect-preset-row">
          <span className="effect-preset-label">Preset</span>
          <div className="effect-preset-chips">
            {PREVIEW_EFFECT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="effect-preset-chip"
                title={preset.description}
                onClick={() => onEffectsChange(applyPreviewEffectPreset(effects, preset))}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <ol className="effect-chip-row">
          {effects.map((entry, index) => {
            const def = EFFECT_DEF_BY_ID.get(entry.id);
            if (!def) return null;
            return (
              <li className={`effect-chip${entry.enabled ? ' effect-chip-active' : ''}`} key={entry.id}>
                <button
                  type="button"
                  className="effect-chip-toggle"
                  aria-pressed={entry.enabled}
                  onClick={() => updateEffect(entry.id, { enabled: !entry.enabled })}
                  title={def.description}
                >
                  <span className="effect-chip-index">{index + 1}</span>
                  <span className="effect-chip-label">{def.label}</span>
                </button>
                <div className="effect-chip-order">
                  <button type="button" onClick={() => moveEffect(entry.id, -1)} disabled={index === 0} aria-label={`Move ${def.label} up`}>▲</button>
                  <button type="button" onClick={() => moveEffect(entry.id, 1)} disabled={index === effects.length - 1} aria-label={`Move ${def.label} down`}>▼</button>
                </div>
              </li>
            );
          })}
        </ol>

        {activeCount > 0 ? (
          <div className="effect-tune-stack">
            {effects.map((entry) => {
              if (!entry.enabled) return null;
              const def = EFFECT_DEF_BY_ID.get(entry.id);
              if (!def || def.params.length === 0) return null;
              return (
                <div className="effect-tune-row" key={entry.id}>
                  <span className="effect-tune-label">{def.label}</span>
                  <div className="effect-tune-sliders">
                    {def.params.map((param) => {
                      const value = entry.options?.[param.key] ?? param.defaultValue;
                      return (
                        <label className="effect-tune-slider" key={param.key}>
                          <span className="effect-tune-slider-label">
                            {param.label}
                            <span className="effect-tune-slider-value">{param.step < 1 ? value.toFixed(2) : value}</span>
                          </span>
                          <input
                            type="range"
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            value={value}
                            onChange={(event) => updateEffectOption(entry.id, param.key, Number(event.target.value))}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {renderError ? <p className="error-banner">{renderError}</p> : null}
      {toolbar.error ? <p className="error-banner">{toolbar.error}</p> : null}
      {toolbar.success ? <p className="success-banner">{toolbar.success}</p> : null}
    </section>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { hasPixelatedEffect, renderForegroundEffectsComposite, type PreviewEffect } from '../lib/art-generator/canvas-filters';
import type { TraitAsset, TraitLayer, TraitLibrary } from '../lib/art-generator/types';

interface GalleryTileProps {
  library: TraitLibrary;
  orderedLayers: TraitLayer[];
  selection: Record<string, string>;
  effects: PreviewEffect[];
  buildAssetUrl: (rootDir: string, asset: TraitAsset) => string;
  size?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function isBackgroundLayer(layer: TraitLayer): boolean {
  return layer.id === 'background' || layer.directoryName === 'background' || layer.name.toLowerCase() === 'background';
}

export function GalleryTile({
  library,
  orderedLayers,
  selection,
  effects,
  buildAssetUrl,
  size = 256,
}: GalleryTileProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTokenRef = useRef(0);
  const pixelated = hasPixelatedEffect(effects);

  const traitsToRender: Array<{ layer: TraitLayer; trait: TraitAsset }> = orderedLayers
    .map((layer) => {
      const trait = layer.traits.find((candidate) => candidate.id === selection[layer.id]);
      return trait ? { layer, trait } : null;
    })
    .filter((entry): entry is { layer: TraitLayer; trait: TraitAsset } => Boolean(entry));

  useEffect(() => {
    renderTokenRef.current += 1;
    const token = renderTokenRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (traitsToRender.length === 0) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    void (async () => {
      try {
        const loaded = await Promise.all(
          traitsToRender.map(({ trait }) => loadImage(buildAssetUrl(library.rootDir, trait))),
        );
        if (token !== renderTokenRef.current) return;

        // Render at a resolution close to the tile's actual display size so
        // pixel-counted effects (scanlines, halftone, mosaic blocks) end up at
        // the same source→display ratio as the main preview (1024 → ~760 CSS,
        // ~1.35×). Rendering at a fixed canonical 1024 here would cause heavy
        // browser downscale aliasing on thin features like CRT scanlines.
        const background = document.createElement('canvas');
        background.width = size;
        background.height = size;
        const backgroundCtx = background.getContext('2d');
        const foreground = document.createElement('canvas');
        foreground.width = size;
        foreground.height = size;
        const foregroundCtx = foreground.getContext('2d');
        if (!backgroundCtx || !foregroundCtx) return;

        loaded.forEach((img, index) => {
          const targetCtx = isBackgroundLayer(traitsToRender[index].layer) ? backgroundCtx : foregroundCtx;
          targetCtx.drawImage(img, 0, 0, size, size);
        });

        renderForegroundEffectsComposite(canvas, background, foreground, effects);
      } catch {
        // tile renders blank on error; main preview already surfaces failures
      }
    })();
  }, [library.rootDir, traitsToRender.map(({ trait }) => `${trait.relativePath}:${trait.version}`).join('|'), effects, size, buildAssetUrl]);

  return (
    <canvas
      ref={canvasRef}
      className={`gallery-tile-canvas${pixelated ? ' preview-canvas-pixelated' : ''}`}
    />
  );
}

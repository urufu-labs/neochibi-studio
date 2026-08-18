'use client';

// Pure, single-token composite renderer used by main-thread operations
// (reroll one, swap traits, compose 1-of-1). The worker inlines its own draw
// step for zero-copy performance across 10k tokens; this helper covers the
// interactive path where we render one token at a time and don't need the
// bulk batching machinery.

import type { TraitLayer } from '@/lib/art-generator/types';

export interface RenderTokenLayer {
  id: string;
  name: string;
  directoryName: string;
  traits: Array<{
    id: string;
    name: string;
    relativePath: string;
    blob: Blob;
  }>;
}

export interface RenderTokenInput {
  layers: RenderTokenLayer[];
  selection: Record<string, string>; // layerId → traitId
  canvasSize?: number;
}

export interface RenderTokenResult {
  blob: Blob;
  traits: Array<{ layerName: string; traitName: string; relativePath: string }>;
}

const DEFAULT_CANVAS_SIZE = 1024;

/**
 * Composite a single token from a layer/selection map. Runs on the main thread
 * using OffscreenCanvas if available (falls back to HTMLCanvasElement).
 * Decodes only the traits that appear in `selection`.
 */
export async function renderToken(input: RenderTokenInput): Promise<RenderTokenResult> {
  const size = input.canvasSize ?? DEFAULT_CANVAS_SIZE;
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable.');

  ctx.clearRect(0, 0, size, size);

  const traits: RenderTokenResult['traits'] = [];
  for (const layer of input.layers) {
    const traitId = input.selection[layer.id];
    if (!traitId) continue;
    const trait = layer.traits.find((t) => t.id === traitId);
    if (!trait) continue;
    const bitmap = await createImageBitmap(trait.blob);
    try {
      ctx.drawImage(bitmap, 0, 0, size, size);
      traits.push({
        layerName: layer.name,
        traitName: trait.name,
        relativePath: trait.relativePath,
      });
    } finally {
      bitmap.close();
    }
  }

  const blob =
    'convertToBlob' in canvas
      ? await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' })
      : await new Promise<Blob>((resolve, reject) => {
          (canvas as HTMLCanvasElement).toBlob(
            (out) => (out ? resolve(out) : reject(new Error('Canvas toBlob returned null.'))),
            'image/png',
          );
        });

  return { blob, traits };
}

/**
 * Map an ordered TraitLayer[] into RenderTokenLayer[] by fetching every trait
 * blob via the store's per-path helper. Call from single-token flows only —
 * the worker path avoids this because it decodes once and transfers bitmaps.
 */
export async function hydrateLayersForRender(
  layers: TraitLayer[],
  getBlob: (relativePath: string) => Promise<Blob | null>,
): Promise<RenderTokenLayer[]> {
  const hydrated: RenderTokenLayer[] = [];
  for (const layer of layers) {
    const traits: RenderTokenLayer['traits'] = [];
    for (const trait of layer.traits) {
      const blob = await getBlob(trait.relativePath);
      if (!blob) continue;
      traits.push({
        id: trait.id,
        name: trait.name,
        relativePath: trait.relativePath,
        blob,
      });
    }
    hydrated.push({
      id: layer.id,
      name: layer.name,
      directoryName: layer.directoryName,
      traits,
    });
  }
  return hydrated;
}

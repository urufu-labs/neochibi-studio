/// <reference lib="webworker" />

// Off-main-thread NFT collection generator. Receives pre-decoded ImageBitmaps
// for every trait so the worker never has to touch the DOM decoder, then rolls
// a single template and composites tokens on an OffscreenCanvas in batches to
// keep memory flat even at 10k tokens.

import {
  normalizeCollectionRules,
  pickWeightedTrait,
  rollFromTemplate,
  type CollectionRules,
} from '@/lib/art-generator/rules';
import type { TraitAsset, TraitLayer } from '@/lib/art-generator/types';
import type { TraitWeights } from '@/lib/art-generator/weights';

// A worker-local shape: each trait carries an ImageBitmap transferred from the main thread.
export interface WorkerTrait extends TraitAsset {
  bitmap: ImageBitmap;
}

export interface WorkerLayer extends Omit<TraitLayer, 'traits'> {
  traits: WorkerTrait[];
}

export interface GeneratorStartMessage {
  type: 'start';
  layers: WorkerLayer[];
  rules: CollectionRules;
  weights: TraitWeights;
  seed: number;
  targetSize: number;
  batchSize: number;
  canvasSize: number;
}

export interface GeneratorAbortMessage {
  type: 'abort';
}

export type GeneratorInboundMessage = GeneratorStartMessage | GeneratorAbortMessage;

export interface GeneratorProgressMessage {
  type: 'progress';
  done: number;
  total: number;
  elapsedMs: number;
  etaMs: number | null;
}

export interface GeneratorTokenMessage {
  type: 'token';
  id: number;
  blob: Blob;
  traits: Array<{ layerName: string; traitName: string; relativePath: string }>;
}

export interface GeneratorDoneMessage {
  type: 'done';
  produced: number;
  elapsedMs: number;
  duplicatesSkipped: number;
  attemptsCap: boolean;
}

export interface GeneratorErrorMessage {
  type: 'error';
  message: string;
}

export type GeneratorOutboundMessage =
  | GeneratorProgressMessage
  | GeneratorTokenMessage
  | GeneratorDoneMessage
  | GeneratorErrorMessage;

// Mulberry32 seeded RNG so the same seed produces the same collection.
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let aborted = false;

async function drawToken(
  canvas: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
  layers: WorkerLayer[],
  selection: Record<string, string>,
): Promise<{ blob: Blob; traits: Array<{ layerName: string; traitName: string; relativePath: string }> }> {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const traits: Array<{ layerName: string; traitName: string; relativePath: string }> = [];
  for (const layer of layers) {
    const traitId = selection[layer.id];
    if (!traitId) continue;
    const trait = layer.traits.find((t) => t.id === traitId);
    if (!trait) continue;
    ctx.drawImage(trait.bitmap, 0, 0, canvas.width, canvas.height);
    traits.push({ layerName: layer.name, traitName: trait.name, relativePath: trait.relativePath });
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { blob, traits };
}

async function runGeneration(message: GeneratorStartMessage): Promise<void> {
  const startedAt = performance.now();
  const rules = normalizeCollectionRules(message.rules);
  const layers = message.layers;
  const rng = makeRng(message.seed);
  const canvas = new OffscreenCanvas(message.canvasSize, message.canvasSize);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ type: 'error', message: 'OffscreenCanvas 2D context unavailable.' } satisfies GeneratorOutboundMessage);
    return;
  }

  const uniqueKeys = new Set<string>();
  let produced = 0;
  let attempts = 0;
  let duplicates = 0;
  const MAX_ATTEMPTS = Math.max(1000, message.targetSize * 30);
  const batchSize = Math.max(1, Math.min(500, message.batchSize));

  while (produced < message.targetSize && attempts < MAX_ATTEMPTS && !aborted) {
    const nextBatchEnd = Math.min(produced + batchSize, message.targetSize);
    while (produced < nextBatchEnd && attempts < MAX_ATTEMPTS && !aborted) {
      attempts += 1;
      const layerAssets: TraitLayer[] = layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        directoryName: layer.directoryName,
        traits: layer.traits.map((trait) => ({
          id: trait.id,
          name: trait.name,
          relativePath: trait.relativePath,
          extension: trait.extension,
          version: trait.version,
        })),
      }));
      const { selection } = rollFromTemplate(layerAssets, rules.template, message.weights, rng, {
        traitPairs: rules.traitPairs,
        layerExclusions: rules.layerExclusions,
      });
      // Guarantee at least one layer picked (otherwise skip).
      if (!Object.keys(selection).length) continue;
      const key = Object.entries(selection)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([layerId, traitId]) => `${layerId}:${traitId}`)
        .join('|');
      if (uniqueKeys.has(key)) {
        duplicates += 1;
        continue;
      }
      uniqueKeys.add(key);
      // Ensure the layer's own weights are respected — pick weighted trait if none set.
      for (const layer of layerAssets) {
        if (!selection[layer.id] && layer.traits.length > 0) {
          const picked = pickWeightedTrait(layer.traits, message.weights, rng);
          if (picked) selection[layer.id] = picked.id;
        }
      }
      const { blob, traits } = await drawToken(canvas, ctx, layers, selection);
      produced += 1;
      (self as unknown as DedicatedWorkerGlobalScope).postMessage(
        { type: 'token', id: produced, blob, traits } satisfies GeneratorOutboundMessage,
      );
    }

    const elapsed = performance.now() - startedAt;
    const rate = produced > 0 ? produced / (elapsed / 1000) : 0;
    const etaMs = rate > 0 ? ((message.targetSize - produced) / rate) * 1000 : null;
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(
      { type: 'progress', done: produced, total: message.targetSize, elapsedMs: elapsed, etaMs } satisfies GeneratorOutboundMessage,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Release ImageBitmaps.
  for (const layer of layers) {
    for (const trait of layer.traits) {
      try { trait.bitmap.close(); } catch { /* noop */ }
    }
  }

  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    {
      type: 'done',
      produced,
      elapsedMs: performance.now() - startedAt,
      duplicatesSkipped: duplicates,
      attemptsCap: attempts >= MAX_ATTEMPTS && produced < message.targetSize,
    } satisfies GeneratorOutboundMessage,
  );
}

self.addEventListener('message', (event: MessageEvent<GeneratorInboundMessage>) => {
  const message = event.data;
  if (message.type === 'abort') {
    aborted = true;
    return;
  }
  if (message.type === 'start') {
    aborted = false;
    runGeneration(message).catch((error) => {
      (self as unknown as DedicatedWorkerGlobalScope).postMessage(
        { type: 'error', message: error instanceof Error ? error.message : 'Generation failed.' } satisfies GeneratorOutboundMessage,
      );
    });
  }
});

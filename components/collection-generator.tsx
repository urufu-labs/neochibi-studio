'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CollectionRules } from '@/lib/art-generator/rules';
import type { TraitLibrary } from '@/lib/art-generator/types';
import type { TraitWeights } from '@/lib/art-generator/weights';
import { getAssetStore, useAssetStoreVersion } from '@/lib/storage/asset-store';
import type {
  GeneratorOutboundMessage,
  GeneratorStartMessage,
  WorkerLayer,
} from '@/lib/workers/generator.worker';

const RENDER_SIZE = 1024;
const BATCH_SIZE = 25;

interface CollectionGeneratorProps {
  library: TraitLibrary | null;
  rules: CollectionRules;
  weights: TraitWeights;
  targetCollectionSize: number;
  onTargetChange: (value: number) => void;
}

interface GenState {
  running: boolean;
  done: number;
  total: number;
  rate: number;
  etaMs: number | null;
  error: string | null;
  lastCompletedAt: number | null;
  duplicatesSkipped: number;
}

const INITIAL_STATE: GenState = {
  running: false,
  done: 0,
  total: 0,
  rate: 0,
  etaMs: null,
  error: null,
  lastCompletedAt: null,
  duplicatesSkipped: 0,
};

function formatEta(ms: number | null): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export function CollectionGenerator({
  library,
  rules,
  weights,
  targetCollectionSize,
  onTargetChange,
}: CollectionGeneratorProps) {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<GenState>(INITIAL_STATE);
  const [collectionName, setCollectionName] = useState('');
  const [description, setDescription] = useState('');
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const previewUrlsRef = useRef<string[]>([]);
  const nextTokenIdRef = useRef<number>(1);
  const storeVersion = useAssetStoreVersion();

  useEffect(() => {
    void getAssetStore().getCollectionMeta().then((meta) => {
      setCollectionName(meta.collectionName);
      setDescription(meta.description);
    });
  }, [storeVersion]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
    };
  }, []);

  const commitName = useCallback((name: string) => {
    const trimmed = name.trim() || 'Untitled Collection';
    const activeId = getAssetStore().getActiveProjectIdSync();
    if (activeId) void getAssetStore().renameProject(activeId, trimmed);
  }, []);

  const traitCount = useMemo(() => {
    if (!library) return 0;
    return library.layers.reduce((sum, layer) => sum + layer.traits.length, 0);
  }, [library]);

  const persistMeta = useCallback(async () => {
    const store = getAssetStore();
    await store.setCollectionMeta(collectionName || 'Untitled Collection', description || '');
  }, [collectionName, description]);

  const cancel = useCallback(() => {
    workerRef.current?.postMessage({ type: 'abort' });
    workerRef.current?.terminate();
    workerRef.current = null;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const start = useCallback(async () => {
    if (!library || library.layers.length === 0) {
      setState((s) => ({ ...s, error: 'Add trait layers before generating.' }));
      return;
    }
    const target = Math.max(1, Math.min(10000, Math.round(targetCollectionSize)));
    setState({
      running: true,
      done: 0,
      total: target,
      rate: 0,
      etaMs: null,
      error: null,
      lastCompletedAt: null,
      duplicatesSkipped: 0,
    });
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setPreviewUrls([]);

    await persistMeta();
    const staticCount = await getAssetStore().staticTokenCount();
    let reservedIds = new Set<number>();
    if (staticCount > 0) {
      const keep = confirm(
        `Keep your ${staticCount} 1-of-1 token${staticCount === 1 ? '' : 's'}? Click OK to keep them, Cancel to wipe everything and start fresh.`,
      );
      if (keep) {
        await getAssetStore().clearGeneratedOutputs();
        const allOutputs = await getAssetStore().listOutputs();
        reservedIds = new Set(allOutputs.filter((o) => o.isStatic).map((o) => o.tokenId));
      } else {
        await getAssetStore().clearOutputs();
      }
    } else {
      await getAssetStore().clearOutputs();
    }
    const workerTarget = Math.max(0, target - reservedIds.size);
    if (workerTarget === 0) {
      setState((s) => ({ ...s, running: false, error: 'Target size equals reserved 1-of-1 slots. Nothing to generate.' }));
      return;
    }
    nextTokenIdRef.current = 1;

    // Decode every trait to ImageBitmap on the main thread, then transfer.
    const store = getAssetStore();
    const layers: WorkerLayer[] = [];
    for (const layer of library.layers) {
      const workerTraits = await Promise.all(
        layer.traits.map(async (trait) => {
          const blob = await store.getBlobForTraitId(trait.id);
          const bitmap = blob ? await createImageBitmap(blob) : null;
          return bitmap
            ? {
                id: trait.id,
                name: trait.name,
                relativePath: trait.relativePath,
                extension: trait.extension,
                version: trait.version,
                bitmap,
              }
            : null;
        }),
      );
      layers.push({
        id: layer.id,
        name: layer.name,
        directoryName: layer.directoryName,
        traits: workerTraits.filter((t): t is NonNullable<typeof t> => Boolean(t)),
      });
    }

    const transferables: Transferable[] = [];
    for (const layer of layers) {
      for (const trait of layer.traits) transferables.push(trait.bitmap);
    }

    const worker = new Worker(new URL('../lib/workers/generator.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.addEventListener('message', (event: MessageEvent<GeneratorOutboundMessage>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        const rate = msg.elapsedMs > 0 ? (msg.done / (msg.elapsedMs / 1000)) : 0;
        setState((s) => ({ ...s, done: msg.done, total: msg.total, rate, etaMs: msg.etaMs }));
      } else if (msg.type === 'token') {
        void (async () => {
          const store = getAssetStore();
          let assignedId = nextTokenIdRef.current;
          while (reservedIds.has(assignedId)) assignedId += 1;
          nextTokenIdRef.current = assignedId + 1;
          const blobPath = store.buildOutputPath(assignedId);
          await store.saveOutput({
            tokenId: assignedId,
            blobPath,
            traits: msg.traits.map((t) => ({ layerName: t.layerName, traitName: t.traitName })),
            blob: msg.blob,
          });
          const url = URL.createObjectURL(msg.blob);
          previewUrlsRef.current = [url, ...previewUrlsRef.current].slice(0, 6);
          if (previewUrlsRef.current.length > 6) {
            const excess = previewUrlsRef.current.slice(6);
            excess.forEach((u) => URL.revokeObjectURL(u));
          }
          setPreviewUrls([...previewUrlsRef.current]);
        })();
      } else if (msg.type === 'done') {
        setState((s) => ({ ...s, running: false, lastCompletedAt: Date.now(), duplicatesSkipped: msg.duplicatesSkipped }));
        worker.terminate();
        workerRef.current = null;
      } else if (msg.type === 'error') {
        setState((s) => ({ ...s, running: false, error: msg.message }));
        worker.terminate();
        workerRef.current = null;
      }
    });

    const seed = Math.floor(Math.random() * 0xffffffff);
    const startMessage: GeneratorStartMessage = {
      type: 'start',
      layers,
      rules,
      weights,
      seed,
      targetSize: workerTarget,
      batchSize: BATCH_SIZE,
      canvasSize: RENDER_SIZE,
    };
    worker.postMessage(startMessage, transferables);
  }, [library, targetCollectionSize, rules, weights, persistMeta]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const progressPct = state.total > 0 ? Math.min(100, (state.done / state.total) * 100) : 0;

  return (
    <section className="uru-shell collection-generator">
      <div className="panel-header compact-panel-header">
        <h2 className="uru-h2">Generate collection ✿</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>
          Runs off-thread on your machine — up to <span className="uru-num">10,000</span> tokens. Nothing leaves your browser until you push to IPFS.
        </p>
      </div>

      <div className="collection-generator-fields" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <label className="field-group">
          <span>Collection name</span>
          <input
            className="uru-input"
            type="text"
            value={collectionName}
            placeholder="Untitled Collection"
            onChange={(event) => setCollectionName(event.target.value)}
            onBlur={(event) => commitName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); commitName(event.currentTarget.value); event.currentTarget.blur(); }
            }}
          />
        </label>
        <label className="field-group">
          <span>Target size</span>
          <input
            className="uru-input"
            type="number"
            min={1}
            max={10000}
            step={1}
            value={targetCollectionSize}
            onChange={(event) => {
              const next = Number(event.target.value);
              onTargetChange(Number.isFinite(next) && next > 0 ? Math.min(10000, Math.floor(next)) : 1);
            }}
          />
        </label>
        <label className="field-group" style={{ gridColumn: '1 / -1' }}>
          <span>Description</span>
          <textarea
            className="uru-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A short description that will appear in each token's metadata."
            rows={3}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="uru-btn uru-btn-primary"
          disabled={state.running || traitCount === 0}
          onClick={() => void start()}
        >
          {state.running ? 'Generating…' : `Generate ${targetCollectionSize.toLocaleString()} tokens`}
        </button>
        {state.running ? (
          <button type="button" className="uru-btn uru-btn-danger" onClick={cancel}>
            Cancel
          </button>
        ) : null}
        {traitCount === 0 ? (
          <span className="uru-eyebrow" style={{ alignSelf: 'center' }}>
            add trait layers to enable generation
          </span>
        ) : null}
      </div>

      {state.running || state.done > 0 ? (
        <div className="uru-shell-tight" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <strong>
              <span className="uru-num">{state.done.toLocaleString()}</span> / <span className="uru-num">{state.total.toLocaleString()}</span>
            </strong>
            <span className="uru-eyebrow">
              rate <span className="uru-num">{state.rate.toFixed(1)}</span>/s · eta {formatEta(state.etaMs)}
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--paper-white)', borderRadius: 999, marginTop: 8, overflow: 'hidden', border: '1px solid var(--anchor)' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--pink-hot)', transition: 'width 200ms ease' }} />
          </div>
          {state.duplicatesSkipped > 0 ? (
            <span className="uru-eyebrow" style={{ marginTop: 6, display: 'block' }}>
              <span className="uru-num">{state.duplicatesSkipped}</span> duplicate rolls skipped
            </span>
          ) : null}
          {previewUrls.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {previewUrls.map((url, index) => (
                <img
                  key={url}
                  src={url}
                  alt={`Token preview ${index + 1}`}
                  className="uru-polaroid"
                  style={{ width: 64, height: 64, objectFit: 'cover', padding: 2 }}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {state.error ? (
        <div
          className="uru-shell-tight"
          role="alert"
          style={{
            marginTop: 12,
            borderColor: 'var(--pink-hot)',
            background: 'var(--pink-warm)',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {state.error}
        </div>
      ) : null}
    </section>
  );
}

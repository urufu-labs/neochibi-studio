'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  downloadCollectionBundle,
  type DownloadProgress,
} from '@/lib/download/download-collection';
import { getAssetStore, useAssetStoreVersion } from '@/lib/storage/asset-store';

interface DownloadPanelProps {
  outputCount: number;
}

interface DownloadState {
  running: boolean;
  phase: DownloadProgress['phase'] | null;
  done: number;
  total: number;
  completedAt: number | null;
  error: string | null;
}

const INITIAL: DownloadState = {
  running: false,
  phase: null,
  done: 0,
  total: 0,
  completedAt: null,
  error: null,
};

const DEFAULT_PREFIX = 'ipfs://REPLACE_WITH_IMAGE_CID/';

export function DownloadPanel({ outputCount }: DownloadPanelProps) {
  useAssetStoreVersion();
  const [state, setState] = useState<DownloadState>(INITIAL);
  const abortRef = useRef(false);
  const [imageBaseUrl, setImageBaseUrl] = useState(DEFAULT_PREFIX);
  const [meta, setMeta] = useState<{ collectionName: string; description: string }>({
    collectionName: '',
    description: '',
  });

  useEffect(() => {
    void getAssetStore().getCollectionMeta().then((next) => setMeta(next));
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const start = useCallback(async () => {
    if (outputCount === 0) return;
    abortRef.current = false;
    setState({
      running: true,
      phase: 'images',
      done: 0,
      total: outputCount,
      completedAt: null,
      error: null,
    });
    try {
      const current = await getAssetStore().getCollectionMeta();
      setMeta(current);
      const result = await downloadCollectionBundle({
        collectionName: current.collectionName || 'Untitled Collection',
        description: current.description || '',
        imageBaseUrl: imageBaseUrl.trim() || DEFAULT_PREFIX,
        shouldAbort: () => abortRef.current,
        onProgress: (progress) => {
          setState((s) => ({ ...s, phase: progress.phase, done: progress.done, total: progress.total }));
        },
      });
      setState((s) => ({ ...s, running: false, completedAt: Date.now(), total: result.tokens, done: result.tokens }));
    } catch (error) {
      setState((s) => ({
        ...s,
        running: false,
        error: error instanceof Error ? error.message : 'Failed to build download bundle.',
      }));
    }
  }, [outputCount, imageBaseUrl]);

  const canDownload = outputCount > 0 && !state.running;
  const progressPct = state.total > 0 ? Math.min(100, (state.done / state.total) * 100) : 0;

  return (
    <section className="uru-shell download-panel">
      <div className="panel-header compact-panel-header">
        <h2 className="uru-h2">Download bundle ✿</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>
          Skip IPFS and grab a zip you can host anywhere. Inside: <code>images/</code>, <code>metadata/</code>, and a README explaining how to swap the image URL after upload.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <label className="field-group">
          <span>Image URL prefix (goes in each metadata &quot;image&quot; field)</span>
          <input
            className="uru-input"
            type="text"
            value={imageBaseUrl}
            onChange={(event) => setImageBaseUrl(event.target.value)}
            placeholder={DEFAULT_PREFIX}
            disabled={state.running}
          />
          <span className="uru-eyebrow" style={{ marginTop: 4 }}>
            leave as placeholder if you&apos;ll rewrite later ・ or paste your final host prefix now (must end with <code>/</code>)
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="uru-btn uru-btn-primary"
          disabled={!canDownload}
          onClick={() => void start()}
          title={outputCount === 0 ? 'Generate a collection first' : undefined}
        >
          {state.running ? 'Packing…' : `Download ${outputCount.toLocaleString()} tokens as zip`}
        </button>
        {state.running ? (
          <button type="button" className="uru-btn uru-btn-danger" onClick={cancel}>
            Cancel
          </button>
        ) : null}
        {outputCount === 0 ? (
          <span className="uru-eyebrow" style={{ alignSelf: 'center' }}>
            generate a collection to enable download
          </span>
        ) : null}
      </div>

      {state.running || (state.done > 0 && !state.completedAt && !state.error) ? (
        <div className="uru-shell-tight" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong className="uru-eyebrow">phase: {state.phase ?? 'starting'}</strong>
            <span>
              <span className="uru-num">{state.done.toLocaleString()}</span> / <span className="uru-num">{state.total.toLocaleString()}</span>
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--paper-white)', borderRadius: 999, marginTop: 8, overflow: 'hidden', border: '1px solid var(--anchor)' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--mint-hot)', transition: 'width 200ms ease' }} />
          </div>
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

      {state.completedAt ? (
        <div
          className="uru-shell-tight"
          style={{
            marginTop: 12,
            borderColor: 'var(--mint-hot)',
            background: 'var(--mint-warm, var(--paper-white))',
            display: 'grid',
            gap: 6,
          }}
        >
          <strong style={{ fontFamily: 'var(--font-round), Klee One, cursive' }}>
            zip saved ✿
          </strong>
          <span className="uru-eyebrow">
            bundled <span className="uru-num">{state.total.toLocaleString()}</span> tokens as
            {' '}<code>{(meta.collectionName || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'collection'}.zip</code>
          </span>
        </div>
      ) : null}
    </section>
  );
}

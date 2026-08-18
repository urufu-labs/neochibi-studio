'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { pinCollection, type PinProgress, type PinResult } from '@/lib/ipfs/pinata';
import { getAssetStore, useAssetStoreVersion } from '@/lib/storage/asset-store';

interface IpfsPushPanelProps {
  outputCount: number;
}

interface PinState {
  running: boolean;
  phase: PinProgress['phase'] | null;
  done: number;
  total: number;
  result: PinResult | null;
  error: string | null;
  jwtAvailable: boolean | null;
}

const INITIAL: PinState = {
  running: false,
  phase: null,
  done: 0,
  total: 0,
  result: null,
  error: null,
  jwtAvailable: null,
};

function short(cid: string): string {
  if (cid.length <= 12) return cid;
  return `${cid.slice(0, 6)}…${cid.slice(-6)}`;
}

export function IpfsPushPanel({ outputCount }: IpfsPushPanelProps) {
  useAssetStoreVersion();
  const [state, setState] = useState<PinState>(INITIAL);
  const abortRef = useRef(false);
  const [meta, setMeta] = useState<{ collectionName: string; description: string }>({ collectionName: '', description: '' });

  useEffect(() => {
    void getAssetStore().getCollectionMeta().then((next) => setMeta(next));
  }, []);

  useEffect(() => {
    // Ping the mint endpoint once to detect JWT availability.
    let cancelled = false;
    fetch('/api/ipfs/mint-jwt', { method: 'POST' })
      .then((res) => {
        if (cancelled) return;
        setState((s) => ({ ...s, jwtAvailable: res.status !== 501 }));
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, jwtAvailable: false }));
      });
    return () => { cancelled = true; };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const start = useCallback(async () => {
    if (outputCount === 0) return;
    abortRef.current = false;
    setState((s) => ({ ...s, running: true, phase: 'images', done: 0, total: outputCount, result: null, error: null }));
    try {
      const current = await getAssetStore().getCollectionMeta();
      setMeta(current);
      const result = await pinCollection({
        collectionName: current.collectionName || 'Untitled Collection',
        description: current.description || '',
        shouldAbort: () => abortRef.current,
        onProgress: (progress) => {
          setState((s) => ({ ...s, phase: progress.phase, done: progress.done, total: progress.total }));
        },
      });
      setState((s) => ({ ...s, running: false, result }));
    } catch (error) {
      setState((s) => ({ ...s, running: false, error: error instanceof Error ? error.message : 'Failed to pin collection.' }));
    }
  }, [outputCount]);

  const noJwt = state.jwtAvailable === false;
  const canPush = outputCount > 0 && !noJwt && !state.running;

  return (
    <section className="uru-shell ipfs-push-panel">
      <div className="panel-header compact-panel-header">
        <h2 className="uru-h2">Push to IPFS ✿</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>
          Publish every token image + metadata to IPFS. Returns a manifest CID you can hand to a launchpad.
        </p>
      </div>

      {noJwt ? (
        <div className="uru-bubble" style={{ marginTop: 10 }}>
          IPFS uploads are temporarily unavailable. Try again later ✿
        </div>
      ) : null}

      {meta.collectionName || meta.description ? (
        <div className="uru-shell-tight" style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          <span className="uru-eyebrow">publishing as</span>
          <strong style={{ fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 15 }}>
            {meta.collectionName || 'Untitled Collection'}
          </strong>
          {meta.description ? (
            <p style={{ margin: 0, color: 'var(--anchor-soft)', fontSize: 13, lineHeight: 1.5 }}>
              {meta.description}
            </p>
          ) : null}
          <span className="uru-eyebrow" style={{ marginTop: 2 }}>
            edit above in ✿ generate collection
          </span>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="uru-btn uru-btn-primary"
          disabled={!canPush}
          onClick={() => void start()}
          title={outputCount === 0 ? 'Generate a collection first' : undefined}
        >
          {state.running ? 'Publishing…' : `Publish ${outputCount.toLocaleString()} tokens to IPFS`}
        </button>
        {state.running ? (
          <button type="button" className="uru-btn uru-btn-danger" onClick={cancel}>
            Cancel
          </button>
        ) : null}
        {outputCount === 0 ? (
          <span className="uru-eyebrow" style={{ alignSelf: 'center' }}>
            generate a collection to enable pinning
          </span>
        ) : null}
      </div>

      {state.running || (state.done > 0 && !state.result) ? (
        <div className="uru-shell-tight" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong className="uru-eyebrow">phase: {state.phase ?? 'starting'}</strong>
            <span>
              <span className="uru-num">{state.done.toLocaleString()}</span> / <span className="uru-num">{state.total.toLocaleString()}</span>
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--paper-white)', borderRadius: 999, marginTop: 8, overflow: 'hidden', border: '1px solid var(--anchor)' }}>
            <div style={{ height: '100%', width: state.total > 0 ? `${Math.min(100, (state.done / state.total) * 100)}%` : '0%', background: 'var(--mint-hot)' }} />
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

      {state.result ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr', marginTop: 12 }}>
          {[
            { label: 'Collection manifest', cid: state.result.collectionManifestCid },
            { label: 'Metadata index', cid: state.result.metadataCid },
          ].map((entry) => (
            <div key={entry.label} className="uru-shell-tight">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                <strong className="uru-eyebrow">{entry.label}</strong>
                <span className="uru-num" title={entry.cid}>{short(entry.cid)}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="uru-btn uru-btn-cream"
                  onClick={() => navigator.clipboard?.writeText(entry.cid).catch(() => undefined)}
                >
                  copy CID
                </button>
                <a
                  className="uru-btn"
                  href={`https://ipfs.io/ipfs/${entry.cid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  open gateway ↗
                </a>
                <button
                  type="button"
                  className="uru-btn uru-btn-cream"
                  onClick={() => navigator.clipboard?.writeText(`ipfs://${entry.cid}`).catch(() => undefined)}
                >
                  copy ipfs://
                </button>
              </div>
            </div>
          ))}
          <p className="uru-eyebrow" style={{ margin: 0 }}>
            pinned <span className="uru-num">{state.result.totalTokens.toLocaleString()}</span> tokens ✿
          </p>
        </div>
      ) : null}
    </section>
  );
}

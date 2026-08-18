'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CollectionRules } from '@/lib/art-generator/rules';
import type { TraitLibrary } from '@/lib/art-generator/types';
import type { TraitWeights } from '@/lib/art-generator/weights';
import { getAssetStore, useAssetStoreVersion } from '@/lib/storage/asset-store';
import type { StoredOutput } from '@/lib/storage/db';

import { TokenSwapEditor } from '@/components/token-swap-editor';
import { OneOfOnePanel } from '@/components/one-of-one-panel';

interface CollectionBrowserProps {
  library: TraitLibrary | null;
  rules: CollectionRules;
  weights: TraitWeights;
}

interface TokenTileProps {
  output: StoredOutput;
  onClick: (output: StoredOutput) => void;
}

/// Grid tile — lazy-loads its own OPFS blob URL, revokes on unmount.
function TokenTile({ output, onClick }: TokenTileProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let assigned: string | null = null;
    void (async () => {
      const blob = await getAssetStore().getOutputBlob(output.tokenId);
      if (cancelled || !blob) return;
      assigned = URL.createObjectURL(blob);
      setUrl(assigned);
    })();
    return () => {
      cancelled = true;
      if (assigned) URL.revokeObjectURL(assigned);
    };
  }, [output.tokenId, output.blobPath]);

  return (
    <button
      type="button"
      className="uru-polaroid collection-browser-tile"
      onClick={() => onClick(output)}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '180px 220px',
        padding: 8,
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'stretch',
        background: 'var(--paper-white)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          background: 'var(--cream-deep)',
          border: '1px solid var(--anchor)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Token #${output.tokenId}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%' }} />
        )}
        {output.isStatic ? (
          <span
            className="uru-stamp uru-stamp-pink"
            style={{ position: 'absolute', top: 4, right: 4, transform: 'rotate(6deg)', fontSize: 10 }}
          >
            1 / 1
          </span>
        ) : null}
      </div>
      <span className="uru-stamp uru-stamp-cream" style={{ alignSelf: 'flex-start', fontSize: 11 }}>
        #<span className="uru-num">{output.tokenId}</span>
      </span>
    </button>
  );
}

interface DetailOverlayProps {
  output: StoredOutput;
  onClose: () => void;
  onDelete: (tokenId: number) => void;
  onReroll: (tokenId: number) => void;
  onOpenSwap: (output: StoredOutput) => void;
  rerolling: boolean;
}

function DetailOverlay({ output, onClose, onDelete, onReroll, onOpenSwap, rerolling }: DetailOverlayProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let assigned: string | null = null;
    void (async () => {
      const blob = await getAssetStore().getOutputBlob(output.tokenId);
      if (cancelled || !blob) return;
      assigned = URL.createObjectURL(blob);
      setUrl(assigned);
    })();
    return () => {
      cancelled = true;
      if (assigned) URL.revokeObjectURL(assigned);
    };
  }, [output.tokenId, output.blobPath, output.traits]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(58,44,58,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        className="uru-shell"
        style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h3 className="uru-h2" style={{ margin: 0 }}>
            Token #<span className="uru-num">{output.tokenId}</span>
          </h3>
          {output.isStatic ? <span className="uru-stamp uru-stamp-pink">1 of 1</span> : null}
          {output.customName ? <span className="uru-eyebrow">{output.customName}</span> : null}
        </div>
        <div
          style={{
            marginTop: 12,
            aspectRatio: '1 / 1',
            width: '100%',
            maxWidth: 360,
            marginLeft: 'auto',
            marginRight: 'auto',
            background: 'var(--paper-white)',
            border: '1.5px solid var(--anchor)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`Token #${output.tokenId}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : null}
        </div>

        <h4 className="uru-eyebrow" style={{ marginTop: 14 }}>attributes</h4>
        <ul className="uru-list-flower" style={{ marginTop: 6 }}>
          {output.traits.map((trait, idx) => (
            <li key={`${trait.layerName}-${idx}`}>
              <strong>{trait.layerName}</strong>: {trait.traitName}
            </li>
          ))}
          {output.customAttributes?.map((attr, idx) => (
            <li key={`custom-${idx}`}>
              <strong>{attr.trait_type}</strong>: {attr.value}
            </li>
          ))}
          {output.traits.length === 0 && !output.customAttributes?.length ? (
            <li style={{ color: 'var(--anchor-soft)' }}>no attributes recorded</li>
          ) : null}
        </ul>

        {output.customDescription ? (
          <p style={{ marginTop: 10, fontFamily: 'var(--font-body), Georgia, serif', fontSize: 14, lineHeight: 1.55 }}>
            {output.customDescription}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="uru-btn uru-btn-cream" onClick={onClose}>Close</button>
          {!output.isStatic ? (
            <button
              type="button"
              className="uru-btn uru-btn-primary"
              disabled={rerolling}
              onClick={() => onReroll(output.tokenId)}
            >
              {rerolling ? 'Rerolling…' : 'Reroll ✿'}
            </button>
          ) : null}
          <button type="button" className="uru-btn" onClick={() => onOpenSwap(output)}>
            Swap traits
          </button>
          <button type="button" className="uru-btn uru-btn-danger" onClick={() => onDelete(output.tokenId)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function CollectionBrowser({ library, rules, weights }: CollectionBrowserProps) {
  useAssetStoreVersion();
  const [outputs, setOutputs] = useState<StoredOutput[]>([]);
  const [detail, setDetail] = useState<StoredOutput | null>(null);
  const [swap, setSwap] = useState<StoredOutput | null>(null);
  const [oneOfOneOpen, setOneOfOneOpen] = useState(false);
  const [filterLayer, setFilterLayer] = useState<string>('');
  const [filterTrait, setFilterTrait] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | 'static-first'>('asc');
  const [jumpTo, setJumpTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rerolling, setRerolling] = useState(false);
  const versionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await getAssetStore().listOutputs();
      if (!cancelled) setOutputs(list);
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch on store changes.
  const storeVersion = useAssetStoreVersion();
  useEffect(() => {
    if (versionRef.current === storeVersion) return;
    versionRef.current = storeVersion;
    let cancelled = false;
    void (async () => {
      const list = await getAssetStore().listOutputs();
      if (!cancelled) setOutputs(list);
    })();
    return () => { cancelled = true; };
  }, [storeVersion]);

  const filtered = useMemo(() => {
    let list = outputs;
    if (filterLayer && filterTrait) {
      list = list.filter((output) =>
        output.traits.some((t) => t.layerName === filterLayer && t.traitName === filterTrait),
      );
    } else if (filterLayer) {
      list = list.filter((output) => output.traits.some((t) => t.layerName === filterLayer));
    }
    const sorted = [...list];
    if (sortOrder === 'asc') sorted.sort((a, b) => a.tokenId - b.tokenId);
    else if (sortOrder === 'desc') sorted.sort((a, b) => b.tokenId - a.tokenId);
    else {
      sorted.sort((a, b) => {
        if (Boolean(a.isStatic) === Boolean(b.isStatic)) return a.tokenId - b.tokenId;
        return a.isStatic ? -1 : 1;
      });
    }
    return sorted;
  }, [outputs, filterLayer, filterTrait, sortOrder]);

  const layerNames = useMemo(() => {
    const set = new Set<string>();
    for (const output of outputs) for (const trait of output.traits) set.add(trait.layerName);
    return Array.from(set).sort();
  }, [outputs]);

  const traitNamesForLayer = useMemo(() => {
    if (!filterLayer) return [];
    const set = new Set<string>();
    for (const output of outputs) {
      for (const trait of output.traits) if (trait.layerName === filterLayer) set.add(trait.traitName);
    }
    return Array.from(set).sort();
  }, [outputs, filterLayer]);

  const handleReroll = useCallback(
    async (tokenId: number) => {
      if (rerolling) return;
      setRerolling(true);
      setError(null);
      try {
        const next = await getAssetStore().rerollToken(tokenId, rules, weights);
        if (next) setDetail(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reroll failed.');
      } finally {
        setRerolling(false);
      }
    },
    [rerolling, rules, weights],
  );

  const handleDelete = useCallback(async (tokenId: number) => {
    if (!confirm(`Delete token #${tokenId}?`)) return;
    await getAssetStore().deleteToken(tokenId);
    setDetail(null);
  }, []);

  const handleJump = useCallback(() => {
    const id = Number(jumpTo);
    if (!Number.isFinite(id)) return;
    const match = outputs.find((output) => output.tokenId === id);
    if (match) setDetail(match);
  }, [jumpTo, outputs]);

  const total = outputs.length;
  const staticCount = outputs.filter((o) => o.isStatic).length;

  return (
    <section className="uru-shell collection-browser">
      <div className="panel-header compact-panel-header">
        <h2 className="uru-h2">Collection browser ✿</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>
          Every token you&apos;ve generated lives here. Click a tile to view, reroll, swap, or delete.
        </p>
      </div>

      <div
        className="collection-browser-toolbar"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}
      >
        <span className="uru-stamp uru-stamp-cream">
          <span className="uru-num">{total.toLocaleString()}</span> total
        </span>
        {staticCount > 0 ? (
          <span className="uru-stamp uru-stamp-pink">
            <span className="uru-num">{staticCount}</span> · 1/1
          </span>
        ) : null}
        <select
          className="uru-input"
          value={filterLayer}
          onChange={(event) => {
            setFilterLayer(event.target.value);
            setFilterTrait('');
          }}
          style={{ maxWidth: 160 }}
        >
          <option value="">all layers</option>
          {layerNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {filterLayer ? (
          <select
            className="uru-input"
            value={filterTrait}
            onChange={(event) => setFilterTrait(event.target.value)}
            style={{ maxWidth: 200 }}
          >
            <option value="">all traits</option>
            {traitNamesForLayer.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : null}
        <select
          className="uru-input"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
          style={{ maxWidth: 180 }}
        >
          <option value="asc">Token id ↑</option>
          <option value="desc">Token id ↓</option>
          <option value="static-first">1/1s first</option>
        </select>
        <input
          className="uru-input"
          type="number"
          placeholder="jump to #"
          value={jumpTo}
          onChange={(event) => setJumpTo(event.target.value)}
          style={{ maxWidth: 120 }}
        />
        <button type="button" className="uru-btn uru-btn-cream" onClick={handleJump}>Go</button>
        {(filterLayer || filterTrait) ? (
          <button
            type="button"
            className="uru-chip"
            onClick={() => { setFilterLayer(''); setFilterTrait(''); }}
          >
            clear filters
          </button>
        ) : null}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="uru-btn uru-btn-primary"
          disabled={!library}
          onClick={() => setOneOfOneOpen(true)}
        >
          Add 1-of-1 ✿
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="uru-shell-tight"
          style={{ marginTop: 10, borderColor: 'var(--pink-hot)', background: 'var(--pink-warm)', fontFamily: 'var(--font-pixel), monospace', fontSize: 12, textTransform: 'uppercase' }}
        >
          {error}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="uru-bubble" style={{ marginTop: 16 }}>
          {total === 0
            ? 'generate a collection to see it here ✿'
            : 'no tokens match the current filter — clear filters to see them all.'}
        </div>
      ) : (
        <div
          className="collection-browser-grid"
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          {filtered.map((output) => (
            <TokenTile key={output.tokenId} output={output} onClick={setDetail} />
          ))}
        </div>
      )}

      {detail ? (
        <DetailOverlay
          output={detail}
          onClose={() => setDetail(null)}
          onDelete={handleDelete}
          onReroll={handleReroll}
          onOpenSwap={(output) => { setSwap(output); }}
          rerolling={rerolling}
        />
      ) : null}

      {swap && library ? (
        <TokenSwapEditor
          output={swap}
          library={library}
          onClose={() => setSwap(null)}
          onSaved={(updated) => {
            setSwap(null);
            setDetail(updated);
          }}
        />
      ) : null}

      {oneOfOneOpen && library ? (
        <OneOfOnePanel
          library={library}
          onClose={() => setOneOfOneOpen(false)}
        />
      ) : null}
    </section>
  );
}

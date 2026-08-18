'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TraitLibrary } from '@/lib/art-generator/types';
import { getAssetStore } from '@/lib/storage/asset-store';
import type { StoredOutput } from '@/lib/storage/db';

interface TokenSwapEditorProps {
  output: StoredOutput;
  library: TraitLibrary;
  onClose: () => void;
  onSaved: (updated: StoredOutput) => void;
}

/// Full-modal editor that lets a user pick a specific trait per layer for a
/// single token. Live-composites a preview using the pure renderer; on save,
/// writes the new blob to OPFS and updates the token record.
export function TokenSwapEditor({ output, library, onClose, onSaved }: TokenSwapEditorProps) {
  const initialSelection = useMemo(() => {
    const map: Record<string, string> = {};
    for (const layer of library.layers) {
      const match = layer.traits.find((trait) =>
        output.traits.some((t) => t.layerName === layer.name && t.traitName === trait.name),
      );
      if (match) map[layer.id] = match.id;
    }
    return map;
  }, [library, output.traits]);

  const [selection, setSelection] = useState<Record<string, string>>(initialSelection);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview whenever selection changes.
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      try {
        const blob = await getAssetStore().renderComposite(selection);
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return created;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview failed.');
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [selection]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await getAssetStore().replaceTokenTraits(output.tokenId, selection);
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }, [output.tokenId, selection, onSaved]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(58,44,58,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 300,
      }}
    >
      <div
        className="uru-shell"
        style={{ maxWidth: 720, width: '100%', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 className="uru-h2" style={{ margin: 0 }}>
            Swap traits · token #<span className="uru-num">{output.tokenId}</span>
          </h3>
        </div>

        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 14,
            gridTemplateColumns: 'minmax(200px, 260px) 1fr',
          }}
        >
          <div
            style={{
              aspectRatio: '1 / 1',
              background: 'var(--paper-white)',
              border: '1.5px solid var(--anchor)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Token preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--anchor-soft)' }}>
                <span className="uru-eyebrow">rendering…</span>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {library.layers.length === 0 ? (
              <div className="uru-bubble">no layers to swap yet.</div>
            ) : (
              library.layers.map((layer) => (
                <label key={layer.id} className="field-group" style={{ display: 'grid', gap: 4 }}>
                  <span className="uru-eyebrow">{layer.name}</span>
                  <select
                    className="uru-input"
                    value={selection[layer.id] ?? ''}
                    onChange={(event) =>
                      setSelection((prev) => {
                        const next = { ...prev };
                        if (event.target.value === '') delete next[layer.id];
                        else next[layer.id] = event.target.value;
                        return next;
                      })
                    }
                  >
                    <option value="">— none —</option>
                    {layer.traits.map((trait) => (
                      <option key={trait.id} value={trait.id}>{trait.name}</option>
                    ))}
                  </select>
                </label>
              ))
            )}
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="uru-shell-tight"
            style={{ marginTop: 12, borderColor: 'var(--pink-hot)', background: 'var(--pink-warm)', fontFamily: 'var(--font-pixel), monospace', fontSize: 12, textTransform: 'uppercase' }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="uru-btn uru-btn-cream" onClick={onClose}>Cancel</button>
          <button type="button" className="uru-btn uru-btn-primary" disabled={busy} onClick={() => void handleSave()}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

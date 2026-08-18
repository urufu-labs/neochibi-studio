'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TraitLibrary } from '@/lib/art-generator/types';
import { getAssetStore } from '@/lib/storage/asset-store';

interface OneOfOnePanelProps {
  library: TraitLibrary;
  onClose: () => void;
}

interface AttributeRow {
  id: string;
  trait_type: string;
  value: string;
}

type Mode = 'upload' | 'compose';

let attrCounter = 0;
function newAttrId(): string {
  attrCounter += 1;
  return `attr-${attrCounter}-${Date.now().toString(36)}`;
}

/// Modal for adding a "1-of-1" bonus token. Two flows: upload a fully-composed
/// PNG, or compose one from existing trait layers. Either way it appends to
/// the end of the collection with a `1 of 1` marker and custom metadata.
export function OneOfOnePanel({ library, onClose }: OneOfOnePanelProps) {
  const [mode, setMode] = useState<Mode>('upload');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [uploadBlob, setUploadBlob] = useState<Blob | null>(null);
  const [uploadName, setUploadName] = useState<string>('');
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview: upload blob or composited selection.
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      try {
        if (mode === 'upload' && uploadBlob) {
          created = URL.createObjectURL(uploadBlob);
        } else if (mode === 'compose') {
          const blob = await getAssetStore().renderComposite(selection);
          if (cancelled) return;
          created = URL.createObjectURL(blob);
        }
        if (cancelled) return;
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
  }, [mode, uploadBlob, selection]);

  const composeTraits = useMemo(() => {
    return library.layers
      .map((layer) => {
        const traitId = selection[layer.id];
        if (!traitId) return null;
        const trait = layer.traits.find((t) => t.id === traitId);
        if (!trait) return null;
        return { layerName: layer.name, traitName: trait.name };
      })
      .filter((entry): entry is { layerName: string; traitName: string } => Boolean(entry));
  }, [library, selection]);

  const canSave = mode === 'upload' ? Boolean(uploadBlob) : composeTraits.length > 0;

  const handleSave = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const store = getAssetStore();
      let blob: Blob | null = null;
      if (mode === 'upload') {
        if (!uploadBlob) throw new Error('Choose a PNG to upload.');
        blob = uploadBlob;
      } else {
        blob = await store.renderComposite(selection);
      }
      await store.addStaticToken({
        blob,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        attributes: attributes
          .map((row) => ({ trait_type: row.trait_type.trim(), value: row.value.trim() }))
          .filter((row) => row.trait_type && row.value),
        traits: mode === 'compose' ? composeTraits : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }, [mode, uploadBlob, selection, name, description, attributes, composeTraits, onClose]);

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
        style={{ maxWidth: 760, width: '100%', maxHeight: '92vh', overflowY: 'auto', position: 'relative' }}
        onClick={(event) => event.stopPropagation()}
      >
        <span
          className="uru-tape uru-tape-pink"
          aria-hidden
          style={{ position: 'absolute', top: -8, right: 30, transform: 'rotate(5deg)' }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 className="uru-h2" style={{ margin: 0 }}>Add a 1-of-1 token ✿</h3>
          <span className="uru-stamp uru-stamp-pink">1 of 1</span>
        </div>
        <p style={{ margin: '6px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>
          These bonus tokens append to the end of your collection and survive regeneration.
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="uru-chip"
            data-active={mode === 'upload' ? 'true' : undefined}
            onClick={() => setMode('upload')}
          >
            upload
          </button>
          <button
            type="button"
            className="uru-chip"
            data-active={mode === 'compose' ? 'true' : undefined}
            onClick={() => setMode('compose')}
          >
            compose from traits
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
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
              <img src={previewUrl} alt="1-of-1 preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--anchor-soft)' }}>
                <span className="uru-eyebrow">
                  {mode === 'upload' ? 'pick a png' : 'choose traits'}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {mode === 'upload' ? (
              <label className="field-group">
                <span>PNG file</span>
                <input
                  className="uru-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      setUploadBlob(file);
                      setUploadName(file.name);
                    }
                  }}
                />
                {uploadName ? (
                  <span className="uru-eyebrow" style={{ marginTop: 4 }}>{uploadName}</span>
                ) : null}
              </label>
            ) : (
              library.layers.map((layer) => (
                <label key={layer.id} className="field-group">
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

        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <label className="field-group">
            <span>Name</span>
            <input
              className="uru-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Golden Wolf"
            />
          </label>
          <label className="field-group">
            <span>Description</span>
            <textarea
              className="uru-input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="A bonus story about this one-of-a-kind."
            />
          </label>

          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
              <span className="uru-eyebrow">custom attributes</span>
              <button
                type="button"
                className="uru-chip"
                onClick={() => setAttributes((rows) => [...rows, { id: newAttrId(), trait_type: '', value: '' }])}
              >
                + add
              </button>
            </div>
            {attributes.map((row) => (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginTop: 6 }}>
                <input
                  className="uru-input"
                  placeholder="trait_type"
                  value={row.trait_type}
                  onChange={(event) =>
                    setAttributes((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, trait_type: event.target.value } : r)),
                    )
                  }
                />
                <input
                  className="uru-input"
                  placeholder="value"
                  value={row.value}
                  onChange={(event) =>
                    setAttributes((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, value: event.target.value } : r)),
                    )
                  }
                />
                <button
                  type="button"
                  className="uru-chip"
                  onClick={() => setAttributes((rows) => rows.filter((r) => r.id !== row.id))}
                >
                  ×
                </button>
              </div>
            ))}
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
          <button
            type="button"
            className="uru-btn uru-btn-primary"
            disabled={!canSave || busy}
            onClick={() => void handleSave()}
          >
            {busy ? 'Saving…' : 'Add 1-of-1'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';

import { getAssetStore, useAssetStoreVersion } from '@/lib/storage/asset-store';

interface UploadDropzoneProps {
  onImport?: (summary: { layerCount: number; traitCount: number }) => void;
}

interface FileEntry {
  path: string;
  file: File;
}

const ACCEPT = 'image/png,image/webp,image/jpeg,image/gif,image/svg+xml';

async function collectFromDataTransfer(items: DataTransferItemList): Promise<FileEntry[]> {
  const collected: FileEntry[] = [];
  const roots = Array.from(items)
    .map((item) => (item.kind === 'file' ? (item as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.() : null))
    .filter(Boolean) as unknown as Array<{
      isFile: boolean;
      isDirectory: boolean;
      name: string;
      fullPath: string;
      file(cb: (file: File) => void, err?: (e: unknown) => void): void;
      createReader(): { readEntries(cb: (entries: unknown[]) => void, err?: (e: unknown) => void): void };
    }>;

  async function walk(entry: (typeof roots)[number], prefix: string): Promise<void> {
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file(
          (file) => {
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (isImageFile(file)) collected.push({ path: relativePath, file });
            resolve();
          },
          () => resolve(),
        );
      });
      return;
    }
    if (entry.isDirectory) {
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      const reader = entry.createReader();
      let done = false;
      while (!done) {
        const batch = await new Promise<unknown[]>((resolve) => {
          reader.readEntries((entries) => resolve(entries), () => resolve([]));
        });
        if (batch.length === 0) {
          done = true;
        } else {
          for (const child of batch as (typeof roots)) {
            await walk(child, nextPrefix);
          }
        }
      }
    }
  }

  for (const root of roots) {
    await walk(root, '');
  }
  return collected;
}

function isImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  const name = file.name.toLowerCase();
  return /\.(png|webp|jpe?g|gif|svg)$/i.test(name);
}

function groupByLayer(entries: FileEntry[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();
  for (const entry of entries) {
    const segments = entry.path.split('/').filter(Boolean);
    // Use the last folder in the path as the layer name; fall back to top-level.
    let layerName: string;
    if (segments.length <= 1) {
      layerName = 'unsorted';
    } else if (segments.length === 2) {
      layerName = segments[0];
    } else {
      layerName = segments[segments.length - 2];
    }
    const bucket = groups.get(layerName) ?? [];
    bucket.push(entry.file);
    groups.set(layerName, bucket);
  }
  return groups;
}

export function UploadDropzone({ onImport }: UploadDropzoneProps) {
  useAssetStoreVersion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const importFiles = useCallback(
    async (grouped: Map<string, File[]>) => {
      if (grouped.size === 0) {
        setError('No image files found in the dropped payload.');
        return;
      }
      setBusy(true);
      setError(null);
      setSuccess(null);
      const store = getAssetStore();
      let layerCount = 0;
      let traitCount = 0;
      try {
        for (const [layerName, files] of grouped.entries()) {
          layerCount += 1;
          for (const file of files) {
            await store.uploadTrait({
              layerName,
              fileName: file.name,
              blob: file,
            });
            traitCount += 1;
          }
        }
        setSuccess(`Imported ${traitCount} trait${traitCount === 1 ? '' : 's'} across ${layerCount} layer${layerCount === 1 ? '' : 's'}.`);
        onImport?.({ layerCount, traitCount });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import files.');
      } finally {
        setBusy(false);
      }
    },
    [onImport],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const items = event.dataTransfer?.items;
      if (items && items.length > 0 && 'webkitGetAsEntry' in items[0]) {
        const entries = await collectFromDataTransfer(items);
        await importFiles(groupByLayer(entries));
        return;
      }
      const files = Array.from(event.dataTransfer?.files ?? []).filter(isImageFile);
      if (files.length === 0) {
        setError('No image files found.');
        return;
      }
      const grouped = new Map<string, File[]>();
      grouped.set(promptLayerName() || 'unsorted', files);
      await importFiles(grouped);
    },
    [importFiles],
  );

  const handleInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []).filter(isImageFile);
      if (files.length === 0) return;
      const grouped = new Map<string, File[]>();
      // If webkitdirectory was used, each file has .webkitRelativePath; group by parent folder.
      const anyHasRelative = files.some((file) => 'webkitRelativePath' in file && (file as { webkitRelativePath: string }).webkitRelativePath);
      if (anyHasRelative) {
        for (const file of files) {
          const rel = (file as { webkitRelativePath: string }).webkitRelativePath || file.name;
          const segments = rel.split('/').filter(Boolean);
          const layerName = segments.length >= 2 ? segments[segments.length - 2] : 'unsorted';
          const bucket = grouped.get(layerName) ?? [];
          bucket.push(file);
          grouped.set(layerName, bucket);
        }
      } else {
        const layerName = promptLayerName() || 'unsorted';
        grouped.set(layerName, files);
      }
      await importFiles(grouped);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [importFiles],
  );

  function promptLayerName(): string | null {
    if (typeof window === 'undefined') return null;
    const name = window.prompt('Which layer should these traits go into? (e.g. background, body, hat)');
    return name?.trim() || null;
  }

  return (
    <div className="uru-shell upload-dropzone">
      <div className="upload-dropzone-header">
        <h2 className="uru-h2" style={{ margin: 0 }}>Import traits ✿</h2>
        <p className="uru-eyebrow" style={{ marginTop: 4 }}>
          drop a folder of layer folders, or click to pick files
        </p>
      </div>
      <div
        className="uru-cart upload-dropzone-target"
        role="button"
        tabIndex={0}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => void handleDrop(event)}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
        }}
        data-drag-over={dragOver ? 'true' : undefined}
        style={{
          border: '2.5px dashed var(--pink-hot)',
          background: dragOver ? 'var(--pink-warm)' : 'var(--paper-white)',
          padding: 20,
          borderRadius: 12,
          textAlign: 'center',
          cursor: 'pointer',
          minHeight: 130,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 120ms ease',
        }}
      >
        <div className="uru-bubble" style={{ margin: 0 }}>
          {busy
            ? 'Importing…'
            : dragOver
              ? 'drop to import ✿'
              : 'drop trait folders here, or click to add a layer ✿'}
        </div>
      </div>
      <div className="upload-dropzone-actions" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="uru-btn uru-btn-primary"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          + add layer / files
        </button>
        <span className="uru-eyebrow" style={{ alignSelf: 'center' }}>
          tip: drag a folder whose subfolders are your layers, or pick a single layer&apos;s PNGs
        </span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        onChange={(event) => void handleInputChange(event)}
        // @ts-expect-error - webkitdirectory is a non-standard but widely supported attribute
        webkitdirectory=""
        directory=""
        style={{ display: 'none' }}
      />
      {error ? (
        <div
          className="uru-shell-tight"
          role="alert"
          style={{
            marginTop: 10,
            borderColor: 'var(--pink-hot)',
            background: 'var(--pink-warm)',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          className="uru-shell-tight"
          role="status"
          style={{
            marginTop: 10,
            borderColor: 'var(--mint-hot)',
            background: 'var(--mint)',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {success}
        </div>
      ) : null}
    </div>
  );
}

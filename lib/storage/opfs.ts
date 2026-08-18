// Thin wrapper over the Origin Private File System (OPFS).
// Trait PNGs and generated output PNGs live here so users can hold gigabytes of
// binary art on-device without cost or an authenticated backend.

const OPFS_UNAVAILABLE_MESSAGE =
  'Origin Private File System is unavailable in this browser. Use a recent Chrome, Edge, Safari, or Firefox.';

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
    throw new Error(OPFS_UNAVAILABLE_MESSAGE);
  }
  return navigator.storage.getDirectory();
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

async function resolveDir(
  parts: string[],
  { create = false }: { create?: boolean } = {},
): Promise<FileSystemDirectoryHandle> {
  let dir = await getRoot();
  for (const segment of parts) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

export async function putBlob(path: string, blob: Blob): Promise<void> {
  const parts = splitPath(path);
  if (parts.length === 0) throw new Error('Path is required.');
  const fileName = parts.pop() as string;
  const dir = await resolveDir(parts, { create: true });
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function getBlob(path: string): Promise<Blob | null> {
  const parts = splitPath(path);
  if (parts.length === 0) return null;
  const fileName = parts.pop() as string;
  try {
    const dir = await resolveDir(parts);
    const handle = await dir.getFileHandle(fileName);
    return await handle.getFile();
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return null;
    throw error;
  }
}

export async function deleteBlob(path: string): Promise<void> {
  const parts = splitPath(path);
  if (parts.length === 0) return;
  const fileName = parts.pop() as string;
  try {
    const dir = await resolveDir(parts);
    await dir.removeEntry(fileName, { recursive: true });
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return;
    throw error;
  }
}

export async function deleteDir(path: string): Promise<void> {
  const parts = splitPath(path);
  if (parts.length === 0) return;
  const name = parts.pop() as string;
  try {
    const parent = await resolveDir(parts);
    await parent.removeEntry(name, { recursive: true });
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return;
    throw error;
  }
}

export async function list(path: string): Promise<string[]> {
  try {
    const dir = await resolveDir(splitPath(path));
    const names: string[] = [];
    for await (const [name] of (dir as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    }).entries()) {
      names.push(name);
    }
    return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return [];
    throw error;
  }
}

export async function move(from: string, to: string): Promise<void> {
  const blob = await getBlob(from);
  if (!blob) return;
  await putBlob(to, blob);
  await deleteBlob(from);
}

export async function estimateUsage(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0 };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

export async function clearAll(): Promise<void> {
  const root = await getRoot();
  for await (const [name] of (root as unknown as {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries()) {
    await root.removeEntry(name, { recursive: true });
  }
}

export function isOpfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
}

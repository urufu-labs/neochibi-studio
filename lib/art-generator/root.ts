export const ROOT_DIR_STORAGE_KEY = 'neochibi-art-generator-root-dir';

export interface DefaultRootResponse {
  rootDir: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryBrowserPayload {
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryEntry[];
}

export function readStoredRootDir(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(ROOT_DIR_STORAGE_KEY) ?? '';
}

export function writeStoredRootDir(rootDir: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ROOT_DIR_STORAGE_KEY, rootDir);
}

export async function fetchDefaultRoot(fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl('/api/art-generator/default-root');
  const payload = (await response.json()) as DefaultRootResponse | { error: string };

  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error : 'Failed to load default root.');
  }

  return payload.rootDir;
}

export async function fetchDirectories(targetPath?: string, fetchImpl: typeof fetch = fetch): Promise<DirectoryBrowserPayload> {
  const params = targetPath?.trim() ? `?${new URLSearchParams({ path: targetPath.trim() }).toString()}` : '';
  const response = await fetchImpl(`/api/art-generator/directories${params}`);
  const payload = (await response.json()) as DirectoryBrowserPayload | { error: string };

  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error : 'Failed to browse directories.');
  }

  return payload;
}

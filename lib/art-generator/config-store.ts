import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseSavedConfig,
  serializeSavedConfig,
  type SavedGeneratorConfig,
  type StoredGeneratorConfigFile,
} from './presets';

const CONFIG_DIRECTORY_NAME = '.studio-configs';

// Frontend server runs from the `frontend/` subdirectory, so the repo root is one level up.
const REPO_ROOT = path.resolve(process.cwd(), '..');

function toRepoRelative(absolutePath: string): string {
  return path.relative(REPO_ROOT, path.resolve(absolutePath));
}

function fromRepoRelative(storedPath: string): string {
  return path.isAbsolute(storedPath) ? storedPath : path.resolve(REPO_ROOT, storedPath);
}

function getConfigDir(rootDir: string) {
  return path.join(path.resolve(rootDir), CONFIG_DIRECTORY_NAME);
}

function getConfigFilePath(rootDir: string, configId: string) {
  return path.join(getConfigDir(rootDir), `${configId}.json`);
}

export async function listStoredConfigs(rootDir: string): Promise<StoredGeneratorConfigFile[]> {
  const configDir = getConfigDir(rootDir);

  try {
    const entries = await readdir(configDir);
    const configs = await Promise.all(
      entries
        .filter((entry) => entry.toLowerCase().endsWith('.json'))
        .map(async (fileName) => {
          const filePath = path.join(configDir, fileName);
          const rawJson = await readFile(filePath, 'utf8');
          const parsed = parseSavedConfig(JSON.parse(rawJson));
          const fileStat = await stat(filePath);

          return {
            ...parsed,
            rootDir: fromRepoRelative(parsed.rootDir),
            updatedAt: parsed.updatedAt || fileStat.mtime.toISOString(),
            rawJson,
            fileName,
          } satisfies StoredGeneratorConfigFile;
        }),
    );

    return configs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function saveStoredConfig(rootDir: string, config: SavedGeneratorConfig, rawJson?: string) {
  const resolvedRoot = path.resolve(rootDir);
  const relativeRoot = toRepoRelative(resolvedRoot);
  // Persist rootDir as a repo-relative path so configs remain portable across checkouts.
  const persisted = parseSavedConfig({ ...config, rootDir: relativeRoot });
  const configDir = getConfigDir(resolvedRoot);
  await mkdir(configDir, { recursive: true });

  const filePath = getConfigFilePath(resolvedRoot, persisted.id);
  const output = rawJson?.trim()
    ? serializeSavedConfig(parseSavedConfig({ ...JSON.parse(rawJson), rootDir: relativeRoot }))
    : serializeSavedConfig(persisted);
  await writeFile(filePath, output, 'utf8');

  const savedRawJson = await readFile(filePath, 'utf8');
  const savedParsed = parseSavedConfig(JSON.parse(savedRawJson));
  return {
    ...savedParsed,
    rootDir: fromRepoRelative(savedParsed.rootDir),
    rawJson: savedRawJson,
    fileName: path.basename(filePath),
  } satisfies StoredGeneratorConfigFile;
}

export async function deleteStoredConfig(rootDir: string, configId: string) {
  await rm(getConfigFilePath(rootDir, configId), { force: true });
}

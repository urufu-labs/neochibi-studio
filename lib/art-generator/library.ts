import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TraitAsset, TraitLayer, TraitLibrary } from './types';

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg']);

interface SaveUploadedTraitInput {
  rootDir: string;
  layerName: string;
  fileName: string;
  bytes: Uint8Array;
  preferredOrder?: number;
}

interface CreateLayerDirectoryInput {
  rootDir: string;
  layerName: string;
  preferredOrder?: number;
}

export interface SaveUploadedTraitResult {
  layerDirectoryName: string;
  fileName: string;
  relativePath: string;
}

export interface CreateLayerDirectoryResult {
  layerDirectoryName: string;
  relativePath: string;
}

export interface RenameAssetResult {
  fileName: string;
  relativePath: string;
}

export interface RenameLayerDirectoryResult {
  layerDirectoryName: string;
  relativePath: string;
}

export interface ReplaceAssetResult {
  fileName: string;
  relativePath: string;
}

function stripOrderPrefix(value: string): string {
  return value.replace(/^\d+[\s._-]*/, '').trim() || value.trim();
}

function getSortPrefix(value: string): number {
  const match = value.match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function compareEntries(a: string, b: string): number {
  const prefixDiff = getSortPrefix(a) - getSortPrefix(b);
  if (prefixDiff !== 0) {
    return prefixDiff;
  }

  return stripOrderPrefix(a).localeCompare(stripOrderPrefix(b), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function sanitizeDisplayName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSupportedImageFile(fileName: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function toPosixRelative(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function padOrder(order: number): string {
  return String(order).padStart(2, '0');
}

async function listLayerDirectories(rootDir: string): Promise<string[]> {
  const directories = await readdir(rootDir, { withFileTypes: true });
  return directories.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function assertSafeRelativePath(rootDir: string, targetPath: string, errorMessage: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(errorMessage);
  }
  return resolvedTarget;
}

function resolveLayerDirectoryName(layerDirectories: string[], layerName: string, preferredOrder?: number): string {
  const cleanedName = sanitizeDisplayName(stripOrderPrefix(layerName));
  if (!cleanedName) {
    throw new Error('Layer name is required.');
  }

  const existingMatch = layerDirectories.find(
    (directoryName) => stripOrderPrefix(directoryName).toLowerCase() === cleanedName.toLowerCase(),
  );
  if (existingMatch) {
    return existingMatch;
  }

  const existingOrders = layerDirectories
    .map((directoryName) => getSortPrefix(directoryName))
    .filter((value) => value !== Number.MAX_SAFE_INTEGER);

  const nextOrder = preferredOrder && preferredOrder > 0
    ? preferredOrder
    : (existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 1);

  return `${padOrder(nextOrder)} ${cleanedName}`;
}

function resolveUploadFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported upload file type.');
  }

  const baseName = sanitizeDisplayName(path.basename(fileName, extension));
  if (!baseName) {
    throw new Error('Upload file name is required.');
  }

  return `${baseName}${extension}`;
}

export async function scanTraitRoot(rootDir: string): Promise<TraitLibrary> {
  const directories = await readdir(rootDir, { withFileTypes: true });
  const layerDirs = directories
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => compareEntries(a.name, b.name));

  const layers = await Promise.all(
    layerDirs.map(async (layerDir) => {
      const layerPath = path.join(rootDir, layerDir.name);
      const files = await readdir(layerPath, { withFileTypes: true });

      const traitEntries = files
        .filter((entry) => entry.isFile() && isSupportedImageFile(entry.name))
        .sort((a, b) => compareEntries(a.name, b.name));

      const traits = await Promise.all(
        traitEntries.map(async (entry) => {
          const traitName = stripOrderPrefix(path.parse(entry.name).name);
          const fullPath = path.join(layerPath, entry.name);
          const relativePath = toPosixRelative(rootDir, fullPath);
          const stats = await stat(fullPath).catch(() => null);
          return {
            id: `${slugify(layerDir.name)}--${slugify(traitName)}`,
            name: traitName,
            relativePath,
            extension: path.extname(entry.name).slice(1).toLowerCase(),
            version: stats ? Math.round(stats.mtimeMs) : 0,
          } satisfies TraitAsset;
        }),
      );

      return {
        id: slugify(layerDir.name),
        name: stripOrderPrefix(layerDir.name),
        directoryName: layerDir.name,
        traits,
      } satisfies TraitLayer;
    }),
  );

  return {
    rootDir,
    layers,
  };
}

export function moveLayer<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length) {
    return items;
  }

  const clampedTarget = Math.max(0, Math.min(items.length - 1, toIndex));
  if (fromIndex === clampedTarget) {
    return items;
  }

  const clone = [...items];
  const [item] = clone.splice(fromIndex, 1);
  clone.splice(clampedTarget, 0, item);
  return clone;
}

export function chooseRandomTraits(layers: Pick<TraitLayer, 'id' | 'traits'>[]): Record<string, string> {
  return layers.reduce<Record<string, string>>((selection, layer) => {
    if (layer.traits.length === 0) {
      return selection;
    }

    const randomIndex = Math.floor(Math.random() * layer.traits.length);
    selection[layer.id] = layer.traits[randomIndex].id;
    return selection;
  }, {});
}

export async function createLayerDirectory({
  rootDir,
  layerName,
  preferredOrder,
}: CreateLayerDirectoryInput): Promise<CreateLayerDirectoryResult> {
  const resolvedRoot = path.resolve(rootDir);
  const layerDirectories = await listLayerDirectories(resolvedRoot);
  const layerDirectoryName = resolveLayerDirectoryName(layerDirectories, layerName, preferredOrder);
  const layerDirectoryPath = path.join(resolvedRoot, layerDirectoryName);
  await mkdir(layerDirectoryPath, { recursive: true });

  return {
    layerDirectoryName,
    relativePath: toPosixRelative(resolvedRoot, layerDirectoryPath),
  };
}

async function resolveUniqueFileName(directoryPath: string, desiredFileName: string): Promise<string> {
  const extension = path.extname(desiredFileName);
  const base = desiredFileName.slice(0, desiredFileName.length - extension.length);

  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? desiredFileName : `${base}-${suffix + 1}${extension}`;
    const candidatePath = path.join(directoryPath, candidate);
    const exists = await stat(candidatePath).then(() => true, () => false);
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Could not find a unique file name for the uploaded trait.');
}

export async function saveUploadedTrait({
  rootDir,
  layerName,
  fileName,
  bytes,
  preferredOrder,
}: SaveUploadedTraitInput): Promise<SaveUploadedTraitResult> {
  const resolvedRoot = path.resolve(rootDir);
  const layerDirectories = await listLayerDirectories(resolvedRoot);
  const layerDirectoryName = resolveLayerDirectoryName(layerDirectories, layerName, preferredOrder);
  const desiredFileName = resolveUploadFileName(fileName);

  const layerDirectoryPath = path.join(resolvedRoot, layerDirectoryName);
  await mkdir(layerDirectoryPath, { recursive: true });

  const safeFileName = await resolveUniqueFileName(layerDirectoryPath, desiredFileName);
  const outputPath = path.join(layerDirectoryPath, safeFileName);
  await writeFile(outputPath, bytes);

  return {
    layerDirectoryName,
    fileName: safeFileName,
    relativePath: toPosixRelative(resolvedRoot, outputPath),
  };
}

export async function renameAsset(rootDir: string, assetRelativePath: string, nextFileName: string): Promise<RenameAssetResult> {
  const resolvedRoot = path.resolve(rootDir);
  const assetPath = await assertSafeAssetPath(resolvedRoot, assetRelativePath);
  const safeFileName = resolveUploadFileName(nextFileName);
  const targetPath = path.join(path.dirname(assetPath), safeFileName);
  await rename(assetPath, targetPath);

  return {
    fileName: safeFileName,
    relativePath: toPosixRelative(resolvedRoot, targetPath),
  };
}

export async function renameLayerDirectory(rootDir: string, layerDirectoryName: string, nextLayerName: string): Promise<RenameLayerDirectoryResult> {
  const resolvedRoot = path.resolve(rootDir);
  const currentPath = assertSafeRelativePath(resolvedRoot, layerDirectoryName, 'Layer path escapes the selected root directory.');
  const order = getSortPrefix(layerDirectoryName);
  const nextDirectoryName = `${padOrder(order)} ${sanitizeDisplayName(stripOrderPrefix(nextLayerName))}`;
  const targetPath = path.join(resolvedRoot, nextDirectoryName);
  await rename(currentPath, targetPath);

  return {
    layerDirectoryName: nextDirectoryName,
    relativePath: toPosixRelative(resolvedRoot, targetPath),
  };
}

export async function reorderLayerDirectories(rootDir: string, orderedDirectoryNames: string[]): Promise<string[]> {
  const resolvedRoot = path.resolve(rootDir);
  const tempEntries: Array<{ tempName: string; finalBaseName: string }> = [];

  for (const directoryName of orderedDirectoryNames) {
    const currentPath = assertSafeRelativePath(resolvedRoot, directoryName, 'Layer path escapes the selected root directory.');
    const finalBaseName = stripOrderPrefix(directoryName);
    const tempName = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${finalBaseName}`;
    const tempPath = path.join(resolvedRoot, tempName);
    await rename(currentPath, tempPath);
    tempEntries.push({ tempName, finalBaseName });
  }

  const finalNames: string[] = [];
  for (let index = 0; index < tempEntries.length; index += 1) {
    const entry = tempEntries[index];
    const finalName = `${padOrder(index + 1)} ${entry.finalBaseName}`;
    await rename(path.join(resolvedRoot, entry.tempName), path.join(resolvedRoot, finalName));
    finalNames.push(finalName);
  }

  return finalNames;
}

export async function deleteAsset(rootDir: string, assetRelativePath: string): Promise<void> {
  const assetPath = await assertSafeAssetPath(rootDir, assetRelativePath);
  await rm(assetPath, { force: true });
}

export async function deleteLayerDirectory(rootDir: string, layerDirectoryName: string): Promise<void> {
  const targetPath = assertSafeRelativePath(rootDir, layerDirectoryName, 'Layer path escapes the selected root directory.');
  await rm(targetPath, { recursive: true, force: true });
}

export async function replaceAsset(rootDir: string, assetRelativePath: string, bytes: Uint8Array): Promise<ReplaceAssetResult> {
  const resolvedRoot = path.resolve(rootDir);
  const assetPath = await assertSafeAssetPath(resolvedRoot, assetRelativePath);
  await writeFile(assetPath, bytes);

  return {
    fileName: path.basename(assetPath),
    relativePath: toPosixRelative(resolvedRoot, assetPath),
  };
}

export async function assertSafeAssetPath(rootDir: string, assetRelativePath: string): Promise<string> {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedAsset = assertSafeRelativePath(resolvedRoot, assetRelativePath, 'Asset path escapes the selected root directory.');

  if (!isSupportedImageFile(resolvedAsset)) {
    throw new Error('Unsupported asset file type.');
  }

  const fileStat = await stat(resolvedAsset);
  if (!fileStat.isFile()) {
    throw new Error('Asset path is not a file.');
  }

  return resolvedAsset;
}

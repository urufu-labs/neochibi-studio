import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { normalizeTraitWeights, type TraitWeights } from './weights';

const WEIGHTS_FILE_NAME = '.studio-weights.json';

function getWeightsFilePath(rootDir: string) {
  return path.join(path.resolve(rootDir), WEIGHTS_FILE_NAME);
}

export async function readTraitWeights(rootDir: string): Promise<TraitWeights> {
  try {
    const raw = await readFile(getWeightsFilePath(rootDir), 'utf8');
    return normalizeTraitWeights(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeTraitWeights(rootDir: string, weights: TraitWeights): Promise<TraitWeights> {
  const resolvedRoot = path.resolve(rootDir);
  await mkdir(resolvedRoot, { recursive: true });
  const normalized = normalizeTraitWeights(weights);
  await writeFile(getWeightsFilePath(resolvedRoot), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

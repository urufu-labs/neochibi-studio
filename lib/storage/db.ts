import { del, get, set } from 'idb-keyval';

import type { PreviewEffect } from '@/lib/art-generator/canvas-filters';
import { normalizePreviewEffects } from '@/lib/art-generator/canvas-filters';
import type { CollectionRules } from '@/lib/art-generator/rules';
import { normalizeCollectionRules } from '@/lib/art-generator/rules';

export const SCHEMA_VERSION = 3;

const KEY_PROJECTS = 'neochibi:projects';
const KEY_ACTIVE = 'neochibi:active-project';
const KEY_SCHEMA = 'neochibi:schema-version';

export interface StoredProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredTrait {
  id: string;
  displayName: string;
  fileName: string;
  extension: string;
  blobPath: string;
  weight: number;
  version: number;
}

export interface StoredLayer {
  id: string;
  name: string;
  directoryName: string;
  order: number;
  enabled: boolean;
  traits: StoredTrait[];
}

export interface StoredConfig {
  id: string;
  name: string;
  layerOrder: string[];
  selectedTraits: Record<string, string>;
  effects: PreviewEffect[];
  rules: CollectionRules;
  updatedAt: string;
  rawJson?: string;
}

export interface StoredOutput {
  tokenId: number;
  blobPath: string;
  traits: Array<{ layerName: string; traitName: string }>;
  /** True for user-curated 1-of-1 tokens that must survive full-collection regenerates. */
  isStatic?: boolean;
  customName?: string;
  customDescription?: string;
  customAttributes?: Array<{ trait_type: string; value: string }>;
}

export interface StoredProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layers: StoredLayer[];
  configs: StoredConfig[];
  outputs: StoredOutput[];
  collectionName: string;
  collectionDescription: string;
  collectionTicker: string;
}

// Legacy record shapes kept only so migrateLegacyProject can read old data.
interface LegacyConfig extends Omit<StoredConfig, 'rules'> {
  rules?: unknown;
  templates?: unknown;
}
interface LegacyOutput extends StoredOutput {
  templateKind?: unknown;
}
interface LegacyProject extends Omit<StoredProject, 'configs' | 'outputs'> {
  configs: LegacyConfig[];
  outputs: LegacyOutput[];
}

function migrateLegacyProject(project: LegacyProject): StoredProject {
  const configs: StoredConfig[] = project.configs.map((config) => ({
    id: config.id,
    name: config.name,
    layerOrder: [...(config.layerOrder ?? [])],
    selectedTraits: { ...(config.selectedTraits ?? {}) },
    effects: normalizePreviewEffects(config.effects),
    rules: normalizeCollectionRules(config.rules ?? config.templates),
    updatedAt: config.updatedAt,
    rawJson: config.rawJson,
  }));
  const outputs: StoredOutput[] = project.outputs.map((output) => ({
    tokenId: output.tokenId,
    blobPath: output.blobPath,
    traits: [...(output.traits ?? [])],
    isStatic: (output as unknown as StoredOutput).isStatic === true,
    customName: (output as unknown as StoredOutput).customName,
    customDescription: (output as unknown as StoredOutput).customDescription,
    customAttributes: (output as unknown as StoredOutput).customAttributes
      ? [...((output as unknown as StoredOutput).customAttributes ?? [])]
      : undefined,
  }));
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    layers: project.layers,
    configs,
    outputs,
    collectionName: project.collectionName,
    collectionDescription: project.collectionDescription,
    collectionTicker: (project as { collectionTicker?: unknown }).collectionTicker
      ? String((project as { collectionTicker?: unknown }).collectionTicker)
      : '',
  };
}

async function ensureSchema(): Promise<void> {
  const stored = (await get(KEY_SCHEMA)) as number | undefined;
  if (stored === undefined) {
    await set(KEY_SCHEMA, SCHEMA_VERSION);
    return;
  }
  if (stored > SCHEMA_VERSION) {
    throw new Error(`urufulabs studio storage schema v${stored} is newer than this build (v${SCHEMA_VERSION}). Refresh the tab.`);
  }
  if (stored < SCHEMA_VERSION) {
    // v1 → v2: config.templates {A, B, weight} → config.rules {template, traitPairs, layerExclusions}.
    //          Also drops StoredOutput.templateKind.
    // v2 → v3: StoredOutput grows optional isStatic + custom{Name,Description,Attributes} fields.
    //          Existing outputs default to isStatic=false. migrateLegacyProject is idempotent so
    //          it covers both jumps.
    const projects = ((await get(KEY_PROJECTS)) ?? []) as LegacyProject[];
    const migrated = projects.map(migrateLegacyProject);
    await set(KEY_PROJECTS, migrated);
    await set(KEY_SCHEMA, SCHEMA_VERSION);
  }
}

export async function loadProjects(): Promise<StoredProject[]> {
  await ensureSchema();
  const stored = ((await get(KEY_PROJECTS)) ?? []) as StoredProject[];
  return stored;
}

export async function saveProjects(projects: StoredProject[]): Promise<void> {
  await ensureSchema();
  await set(KEY_PROJECTS, projects);
}

export async function loadActiveProjectId(): Promise<string | null> {
  await ensureSchema();
  return ((await get(KEY_ACTIVE)) as string | undefined) ?? null;
}

export async function saveActiveProjectId(id: string | null): Promise<void> {
  await ensureSchema();
  if (id === null) {
    await del(KEY_ACTIVE);
  } else {
    await set(KEY_ACTIVE, id);
  }
}

export async function clearDatabase(): Promise<void> {
  await del(KEY_PROJECTS);
  await del(KEY_ACTIVE);
  await del(KEY_SCHEMA);
}

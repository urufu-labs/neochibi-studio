import { normalizePreviewEffects, type PreviewEffect } from './canvas-filters';
import { DEFAULT_LAYER_CHANCE_PERCENT, DEFAULT_TEMPLATES, normalizeCollectionTemplates, type CollectionTemplates } from './rules';
import type { TraitLibrary } from './types';

export interface SavedGeneratorConfig {
  id: string;
  name: string;
  rootDir: string;
  layerOrder: string[];
  selectedTraits: Record<string, string>;
  effects: PreviewEffect[];
  templates: CollectionTemplates;
  updatedAt: string;
}

interface CreateSavedConfigInput {
  id?: string;
  name: string;
  rootDir: string;
  layerOrder: string[];
  selectedTraits: Record<string, string>;
  effects?: PreviewEffect[];
  templates?: CollectionTemplates;
  updatedAt?: string;
}

export interface StoredGeneratorConfigFile extends SavedGeneratorConfig {
  rawJson: string;
  fileName: string;
}

export function createSavedConfig({
  id,
  name,
  rootDir,
  layerOrder,
  selectedTraits,
  effects,
  templates,
  updatedAt,
}: CreateSavedConfigInput): SavedGeneratorConfig {
  return {
    id: id?.trim() || `cfg_${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim(),
    rootDir,
    layerOrder: [...layerOrder],
    selectedTraits: { ...selectedTraits },
    effects: normalizePreviewEffects(effects ?? []),
    templates: normalizeCollectionTemplates(templates ?? DEFAULT_TEMPLATES),
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
}

export function parseSavedConfig(input: unknown): SavedGeneratorConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('Saved config must be a JSON object.');
  }

  const candidate = input as Partial<SavedGeneratorConfig>;
  const name = String(candidate.name ?? '').trim();
  const rootDir = String(candidate.rootDir ?? '').trim();
  const layerOrder = Array.isArray(candidate.layerOrder) ? candidate.layerOrder.map(String) : [];
  const selectedTraits =
    candidate.selectedTraits && typeof candidate.selectedTraits === 'object'
      ? Object.fromEntries(
          Object.entries(candidate.selectedTraits as Record<string, unknown>).map(([layerId, traitId]) => [layerId, String(traitId)]),
        )
      : {};

  if (!name) {
    throw new Error('Saved config name is required.');
  }

  if (!rootDir) {
    throw new Error('Saved config rootDir is required.');
  }

  return createSavedConfig({
    id: candidate.id,
    name,
    rootDir,
    layerOrder,
    selectedTraits,
    effects: normalizePreviewEffects((candidate as { effects?: unknown }).effects),
    templates: normalizeCollectionTemplates((candidate as { templates?: unknown }).templates),
    updatedAt: candidate.updatedAt ? String(candidate.updatedAt) : undefined,
  });
}

export function serializeSavedConfig(config: SavedGeneratorConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function hydrateSavedConfig(config: SavedGeneratorConfig, library: TraitLibrary) {
  const validLayerIds = new Set(library.layers.map((layer) => layer.id));
  const layerOrder = config.layerOrder.filter((layerId) => validLayerIds.has(layerId));

  const selectedTraits = library.layers.reduce<Record<string, string>>((acc, layer) => {
    const savedTraitId = config.selectedTraits[layer.id];
    if (savedTraitId && layer.traits.some((trait) => trait.id === savedTraitId)) {
      acc[layer.id] = savedTraitId;
    }
    return acc;
  }, {});

  const templates = normalizeCollectionTemplates(config.templates);
  const validTraitPaths = new Set<string>();
  for (const layer of library.layers) {
    for (const trait of layer.traits) validTraitPaths.add(trait.relativePath);
  }
  const filterLayerIds = (ids: string[]) => ids.filter((id) => validLayerIds.has(id));
  const filterTraitPaths = (paths: string[]) => paths.filter((p) => validTraitPaths.has(p));
  const filterARules = (templates.templateA.layerRules ?? []).map((rule) => ({
    layerId: rule.layerId,
    chancePercent: rule.chancePercent,
    excludeLayerIds: filterLayerIds(rule.excludeLayerIds),
  }));
  const filterBRules = (templates.templateB.layerRules ?? []).map((rule) => ({
    layerId: rule.layerId,
    chancePercent: rule.chancePercent,
    excludeLayerIds: filterLayerIds(rule.excludeLayerIds),
  }));
  const filteredTemplates: CollectionTemplates = {
    templateA: {
      alwaysLayerIds: filterLayerIds(templates.templateA.alwaysLayerIds),
      neverLayerIds: filterLayerIds(templates.templateA.neverLayerIds),
      excludedTraitPaths: filterTraitPaths(templates.templateA.excludedTraitPaths),
      layerRules: filterARules.filter(
        (rule) => validLayerIds.has(rule.layerId) && (rule.chancePercent !== DEFAULT_LAYER_CHANCE_PERCENT || rule.excludeLayerIds.length > 0),
      ),
    },
    templateB: {
      alwaysLayerIds: filterLayerIds(templates.templateB.alwaysLayerIds),
      neverLayerIds: filterLayerIds(templates.templateB.neverLayerIds),
      excludedTraitPaths: filterTraitPaths(templates.templateB.excludedTraitPaths),
      layerRules: filterBRules.filter(
        (rule) => validLayerIds.has(rule.layerId) && (rule.chancePercent !== DEFAULT_LAYER_CHANCE_PERCENT || rule.excludeLayerIds.length > 0),
      ),
    },
    templateAWeight: templates.templateAWeight,
    traitPairs: templates.traitPairs.filter((p) => validTraitPaths.has(p.a) && validTraitPaths.has(p.b)),
    layerExclusions: templates.layerExclusions
      .map((rule) => ({
        sourceLayerId: rule.sourceLayerId,
        excludeLayerIds: filterLayerIds(rule.excludeLayerIds),
      }))
      .filter((rule) => validLayerIds.has(rule.sourceLayerId) && rule.excludeLayerIds.length > 0),
  };

  return {
    ...config,
    layerOrder,
    selectedTraits,
    effects: normalizePreviewEffects(config.effects),
    templates: filteredTemplates,
  };
}

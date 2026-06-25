import type { TraitAsset, TraitLayer } from './types';
import { DEFAULT_TRAIT_WEIGHT, type TraitWeights } from './weights';

export type TemplateKind = 'templateA' | 'templateB';
export const TEMPLATE_KINDS: TemplateKind[] = ['templateA', 'templateB'];
export const DEFAULT_LAYER_CHANCE_PERCENT = 100;

export interface TemplateLayerRule {
  layerId: string;
  chancePercent: number;
  excludeLayerIds: string[];
}

export interface CollectionTemplate {
  alwaysLayerIds: string[];
  neverLayerIds: string[];
  excludedTraitPaths: string[];
  layerRules?: TemplateLayerRule[];
}

export interface TraitPair {
  a: string;
  b: string;
}

export interface LayerExclusion {
  sourceLayerId: string;
  excludeLayerIds: string[];
}

export interface CollectionTemplates {
  templateA: CollectionTemplate;
  templateB: CollectionTemplate;
  templateAWeight: number;
  traitPairs: TraitPair[];
  layerExclusions: LayerExclusion[];
}

export const DEFAULT_TEMPLATES: CollectionTemplates = {
  templateA: { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [], layerRules: [] },
  templateB: { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [], layerRules: [] },
  templateAWeight: 50,
  traitPairs: [],
  layerExclusions: [],
};

export function normalizeCollectionTemplates(input: unknown): CollectionTemplates {
  if (!input || typeof input !== 'object') {
    return {
      templateA: normalizeTemplate(DEFAULT_TEMPLATES.templateA),
      templateB: normalizeTemplate(DEFAULT_TEMPLATES.templateB),
      templateAWeight: DEFAULT_TEMPLATES.templateAWeight,
      traitPairs: [],
      layerExclusions: [],
    };
  }
  const candidate = input as Partial<CollectionTemplates>;
  return {
    templateA: normalizeTemplate(candidate.templateA),
    templateB: normalizeTemplate(candidate.templateB),
    templateAWeight: clampWeight(candidate.templateAWeight),
    traitPairs: normalizeTraitPairs(candidate.traitPairs),
    layerExclusions: normalizeLayerExclusions(candidate.layerExclusions),
  };
}

function normalizeTemplate(input: unknown): CollectionTemplate {
  if (!input || typeof input !== 'object') {
    return { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [], layerRules: [] };
  }
  const candidate = input as Partial<CollectionTemplate>;
  return {
    alwaysLayerIds: Array.isArray(candidate.alwaysLayerIds) ? candidate.alwaysLayerIds.map(String) : [],
    neverLayerIds: Array.isArray(candidate.neverLayerIds) ? candidate.neverLayerIds.map(String) : [],
    excludedTraitPaths: Array.isArray(candidate.excludedTraitPaths) ? candidate.excludedTraitPaths.map(String) : [],
    layerRules: normalizeTemplateLayerRules(candidate.layerRules),
  };
}

function normalizeTemplateLayerRules(input: unknown): TemplateLayerRule[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, TemplateLayerRule>();
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Partial<TemplateLayerRule> & {
      appearChancePercent?: unknown;
      chance?: unknown;
    };
    const layerId = String(candidate.layerId ?? '').trim();
    if (!layerId) continue;

    const existing = merged.get(layerId) ?? {
      layerId,
      chancePercent: DEFAULT_LAYER_CHANCE_PERCENT,
      excludeLayerIds: [],
    };
    const rawChance =
      candidate.chancePercent ?? candidate.appearChancePercent ?? candidate.chance ?? existing.chancePercent;
    const excludeLayerIds = Array.isArray(candidate.excludeLayerIds)
      ? candidate.excludeLayerIds.map(String).filter((id) => id && id !== layerId)
      : existing.excludeLayerIds;

    merged.set(layerId, {
      layerId,
      chancePercent: clampPercent(rawChance, existing.chancePercent),
      excludeLayerIds: Array.from(new Set([...existing.excludeLayerIds, ...excludeLayerIds])),
    });
  }

  return Array.from(merged.values()).filter(shouldKeepLayerRule);
}

function normalizeTraitPairs(input: unknown): TraitPair[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: TraitPair[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const a = String((entry as Partial<TraitPair>).a ?? '').trim();
    const b = String((entry as Partial<TraitPair>).b ?? '').trim();
    if (!a || !b || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a, b });
  }
  return out;
}

function normalizeLayerExclusions(input: unknown): LayerExclusion[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, Set<string>>();
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const sourceLayerId = String((entry as Partial<LayerExclusion>).sourceLayerId ?? '').trim();
    if (!sourceLayerId) continue;
    const raw = (entry as Partial<LayerExclusion>).excludeLayerIds;
    const excludeLayerIds = Array.isArray(raw) ? raw.map(String).filter((id) => id && id !== sourceLayerId) : [];
    if (excludeLayerIds.length === 0) continue;
    if (!merged.has(sourceLayerId)) merged.set(sourceLayerId, new Set());
    const set = merged.get(sourceLayerId)!;
    for (const id of excludeLayerIds) set.add(id);
  }
  return Array.from(merged.entries()).map(([sourceLayerId, set]) => ({
    sourceLayerId,
    excludeLayerIds: Array.from(set),
  }));
}

function clampPercent(value: unknown, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  const resolved = Number.isFinite(num) ? num : fallback;
  return Math.max(0, Math.min(100, Math.round(resolved)));
}

function clampWeight(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function shouldKeepLayerRule(rule: TemplateLayerRule): boolean {
  return rule.chancePercent !== DEFAULT_LAYER_CHANCE_PERCENT || rule.excludeLayerIds.length > 0;
}

export function pickTemplateKind(templateAWeight: number, rng: () => number = Math.random): TemplateKind {
  return rng() * 100 < templateAWeight ? 'templateA' : 'templateB';
}

export interface RollFromTemplateResult {
  selection: Record<string, string>;
  missingAlways: string[];
}

export function pickWeightedTrait(
  traits: TraitAsset[],
  weights: TraitWeights | undefined,
  rng: () => number = Math.random,
): TraitAsset | null {
  if (traits.length === 0) return null;
  const resolved = traits.map((trait) => {
    const w = weights?.[trait.relativePath];
    return typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : DEFAULT_TRAIT_WEIGHT;
  });
  const total = resolved.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;
  let target = rng() * total;
  for (let i = 0; i < traits.length; i += 1) {
    target -= resolved[i];
    if (target < 0) return traits[i];
  }
  return traits[traits.length - 1];
}

export interface RollOptions {
  traitPairs?: TraitPair[];
  layerExclusions?: LayerExclusion[];
}

export function rollFromTemplate(
  layers: TraitLayer[],
  template: CollectionTemplate,
  weights: TraitWeights = {},
  rng: () => number = Math.random,
  options: RollOptions = {},
): RollFromTemplateResult {
  const selection: Record<string, string> = {};
  const missingAlways: string[] = [];
  const never = new Set(template.neverLayerIds);
  const always = new Set(template.alwaysLayerIds);
  const excludedTraitPaths = new Set(template.excludedTraitPaths ?? []);
  const layerRules = buildTemplateLayerRuleMap(template.layerRules);

  for (const layer of layers) {
    if (never.has(layer.id)) continue;
    const isAlways = always.has(layer.id);
    const chancePercent = isAlways ? DEFAULT_LAYER_CHANCE_PERCENT : (layerRules.get(layer.id)?.chancePercent ?? DEFAULT_LAYER_CHANCE_PERCENT);
    if (!isAlways && chancePercent <= 0) continue;
    if (!isAlways && chancePercent < DEFAULT_LAYER_CHANCE_PERCENT && rng() * 100 >= chancePercent) continue;
    if (layer.traits.length === 0) {
      if (isAlways) missingAlways.push(layer.id);
      continue;
    }
    const eligible = layer.traits.filter((trait) => !excludedTraitPaths.has(trait.relativePath));
    if (eligible.length === 0) {
      if (isAlways) missingAlways.push(layer.id);
      continue;
    }
    const picked = pickWeightedTrait(eligible, weights, rng);
    if (picked) {
      selection[layer.id] = picked.id;
    } else if (always.has(layer.id)) {
      missingAlways.push(layer.id);
    }
  }

  applyTraitPairs(selection, layers, options.traitPairs ?? [], never, excludedTraitPaths);
  applyTemplateLayerRuleExclusions(selection, layerRules);
  applyLayerExclusions(selection, options.layerExclusions ?? []);

  return { selection, missingAlways };
}

function buildTemplateLayerRuleMap(rules: TemplateLayerRule[] | undefined): Map<string, TemplateLayerRule> {
  return new Map(normalizeTemplateLayerRules(rules).map((rule) => [rule.layerId, rule]));
}

function applyTraitPairs(
  selection: Record<string, string>,
  layers: TraitLayer[],
  pairs: TraitPair[],
  never: Set<string>,
  excludedTraitPaths: Set<string>,
): void {
  if (pairs.length === 0) return;
  const pathLookup = new Map<string, { layerId: string; traitId: string }>();
  for (const layer of layers) {
    for (const trait of layer.traits) {
      pathLookup.set(trait.relativePath, { layerId: layer.id, traitId: trait.id });
    }
  }
  const traitIdLookup = new Map<string, string>();
  for (const layer of layers) {
    for (const trait of layer.traits) traitIdLookup.set(trait.id, trait.relativePath);
  }

  for (const pair of pairs) {
    const aInfo = pathLookup.get(pair.a);
    const bInfo = pathLookup.get(pair.b);
    if (!aInfo || !bInfo) continue;
    const selectedAPath = traitIdLookup.get(selection[aInfo.layerId] ?? '') ?? null;
    const selectedBPath = traitIdLookup.get(selection[bInfo.layerId] ?? '') ?? null;
    if (selectedAPath === pair.a) {
      if (!never.has(bInfo.layerId) && !excludedTraitPaths.has(pair.b)) {
        selection[bInfo.layerId] = bInfo.traitId;
      }
    } else if (selectedBPath === pair.b) {
      if (!never.has(aInfo.layerId) && !excludedTraitPaths.has(pair.a)) {
        selection[aInfo.layerId] = aInfo.traitId;
      }
    }
  }
}

function applyLayerExclusions(selection: Record<string, string>, rules: LayerExclusion[]): void {
  if (rules.length === 0) return;
  for (const rule of rules) {
    if (!selection[rule.sourceLayerId]) continue;
    for (const layerId of rule.excludeLayerIds) {
      delete selection[layerId];
    }
  }
}

function applyTemplateLayerRuleExclusions(selection: Record<string, string>, rules: Map<string, TemplateLayerRule>): void {
  if (rules.size === 0) return;
  for (const rule of rules.values()) {
    if (!selection[rule.layerId]) continue;
    for (const layerId of rule.excludeLayerIds) {
      delete selection[layerId];
    }
  }
}

export function templateCapacity(
  layers: TraitLayer[],
  template: CollectionTemplate,
  weights: TraitWeights = {},
): number {
  const never = new Set(template.neverLayerIds);
  const always = new Set(template.alwaysLayerIds);
  const excludedTraitPaths = new Set(template.excludedTraitPaths ?? []);
  const layerRules = buildTemplateLayerRuleMap(template.layerRules);
  return layers.reduce((acc, layer) => {
    if (never.has(layer.id)) return acc;
    if (layer.traits.length === 0) return acc;
    const viable = layer.traits.filter((trait) => {
      if (excludedTraitPaths.has(trait.relativePath)) return false;
      const w = weights[trait.relativePath];
      const resolved = typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : DEFAULT_TRAIT_WEIGHT;
      return resolved > 0;
    }).length;
    if (viable === 0) return acc;
    if (!always.has(layer.id)) {
      const chancePercent = layerRules.get(layer.id)?.chancePercent ?? DEFAULT_LAYER_CHANCE_PERCENT;
      if (chancePercent <= 0) return acc;
      if (chancePercent < DEFAULT_LAYER_CHANCE_PERCENT) return acc * (viable + 1);
    }
    return acc * viable;
  }, 1);
}

function buildFingerprint(layerOrder: string[], selection: Record<string, string>): string {
  return layerOrder.map((layerId) => `${layerId}:${selection[layerId] ?? 'none'}`).join('|');
}

export interface SimulationTraitStat {
  relativePath: string;
  layerId: string;
  layerName: string;
  traitName: string;
  weight: number;
  count: number;
}

export interface SimulationResult {
  targetSize: number;
  totalAttempts: number;
  uniqueCount: number;
  templateCounts: Record<TemplateKind, number>;
  traitStats: SimulationTraitStat[];
  missingAlwaysEvents: number;
}

interface SimulateCollectionInput {
  layers: TraitLayer[];
  layerOrder: string[];
  templates: CollectionTemplates;
  weights?: TraitWeights;
  targetSize: number;
  attemptsMultiplier?: number;
  rng?: () => number;
}

export function simulateCollection({
  layers,
  layerOrder,
  templates,
  weights = {},
  targetSize,
  attemptsMultiplier = 1.5,
  rng = Math.random,
}: SimulateCollectionInput): SimulationResult {
  const target = Math.max(1, Math.floor(targetSize));
  const cap = Math.max(target * 2, Math.ceil(target * attemptsMultiplier));
  const orderedLayerIds = layerOrder.length > 0 ? layerOrder : layers.map((layer) => layer.id);
  const fingerprints = new Set<string>();
  const templateCounts: Record<TemplateKind, number> = { templateA: 0, templateB: 0 };
  const traitCounts = new Map<string, number>();
  let missingAlwaysEvents = 0;
  let attempts = 0;

  const rollOptions: RollOptions = {
    traitPairs: templates.traitPairs ?? [],
    layerExclusions: templates.layerExclusions ?? [],
  };

  while (fingerprints.size < target && attempts < cap) {
    attempts += 1;
    const kind = pickTemplateKind(templates.templateAWeight, rng);
    const { selection, missingAlways } = rollFromTemplate(layers, templates[kind], weights, rng, rollOptions);
    if (missingAlways.length > 0) missingAlwaysEvents += 1;
    const fingerprint = `${kind}|${buildFingerprint(orderedLayerIds, selection)}`;
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    templateCounts[kind] += 1;
    for (const traitId of Object.values(selection)) {
      traitCounts.set(traitId, (traitCounts.get(traitId) ?? 0) + 1);
    }
  }

  const traitStats: SimulationTraitStat[] = [];
  for (const layer of layers) {
    for (const trait of layer.traits) {
      const w = weights[trait.relativePath];
      const resolved = typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : DEFAULT_TRAIT_WEIGHT;
      traitStats.push({
        relativePath: trait.relativePath,
        layerId: layer.id,
        layerName: layer.name,
        traitName: trait.name,
        weight: resolved,
        count: traitCounts.get(trait.id) ?? 0,
      });
    }
  }

  return {
    targetSize: target,
    totalAttempts: attempts,
    uniqueCount: fingerprints.size,
    templateCounts,
    traitStats,
    missingAlwaysEvents,
  };
}

export function getLayerTemplateState(
  template: CollectionTemplate,
  layerId: string,
): 'always' | 'never' | 'optional' {
  if (template.neverLayerIds.includes(layerId)) return 'never';
  if (template.alwaysLayerIds.includes(layerId)) return 'always';
  return 'optional';
}

export function setLayerTemplateState(
  template: CollectionTemplate,
  layerId: string,
  state: 'always' | 'never' | 'optional',
): CollectionTemplate {
  const alwaysLayerIds = template.alwaysLayerIds.filter((id) => id !== layerId);
  const neverLayerIds = template.neverLayerIds.filter((id) => id !== layerId);
  if (state === 'always') alwaysLayerIds.push(layerId);
  if (state === 'never') neverLayerIds.push(layerId);
  return {
    alwaysLayerIds,
    neverLayerIds,
    excludedTraitPaths: template.excludedTraitPaths ?? [],
    layerRules: normalizeTemplateLayerRules(template.layerRules),
  };
}

export function getTemplateLayerRule(template: CollectionTemplate, layerId: string): TemplateLayerRule {
  return normalizeTemplateLayerRules(template.layerRules).find((rule) => rule.layerId === layerId) ?? {
    layerId,
    chancePercent: DEFAULT_LAYER_CHANCE_PERCENT,
    excludeLayerIds: [],
  };
}

export function setTemplateLayerRule(
  template: CollectionTemplate,
  layerId: string,
  update: Partial<Pick<TemplateLayerRule, 'chancePercent' | 'excludeLayerIds'>>,
): CollectionTemplate {
  const cleanLayerId = layerId.trim();
  if (!cleanLayerId) return template;

  const rules = normalizeTemplateLayerRules(template.layerRules);
  const existing = rules.find((rule) => rule.layerId === cleanLayerId) ?? {
    layerId: cleanLayerId,
    chancePercent: DEFAULT_LAYER_CHANCE_PERCENT,
    excludeLayerIds: [],
  };
  const nextRule: TemplateLayerRule = {
    layerId: cleanLayerId,
    chancePercent:
      update.chancePercent === undefined
        ? existing.chancePercent
        : clampPercent(update.chancePercent, existing.chancePercent),
    excludeLayerIds:
      update.excludeLayerIds === undefined
        ? existing.excludeLayerIds
        : Array.from(new Set(update.excludeLayerIds.map(String).filter((id) => id && id !== cleanLayerId))),
  };

  return {
    alwaysLayerIds: [...template.alwaysLayerIds],
    neverLayerIds: [...template.neverLayerIds],
    excludedTraitPaths: [...(template.excludedTraitPaths ?? [])],
    layerRules: normalizeTemplateLayerRules([...rules.filter((rule) => rule.layerId !== cleanLayerId), nextRule]),
  };
}

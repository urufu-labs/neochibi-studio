'use client';

// AssetStore — client-side replacement for the deleted /api/art-generator/*
// server routes. All trait bytes live in OPFS; all metadata lives in IndexedDB
// via idb-keyval. Public API mirrors the shapes the studio component already
// expects (TraitLibrary/TraitLayer/TraitAsset) so the call-site rewrite stays
// mechanical.

import { useSyncExternalStore } from 'react';

import type { CollectionRules } from '@/lib/art-generator/rules';
import { normalizeCollectionRules, rollFromTemplate } from '@/lib/art-generator/rules';
import { hydrateLayersForRender, renderToken } from '@/lib/art-generator/pure/render-token';
import type { PreviewEffect } from '@/lib/art-generator/canvas-filters';
import { normalizePreviewEffects } from '@/lib/art-generator/canvas-filters';
import type { TraitAsset, TraitLayer, TraitLibrary } from '@/lib/art-generator/types';
import { DEFAULT_TRAIT_WEIGHT, type TraitWeights } from '@/lib/art-generator/weights';

import * as opfs from './opfs';
import {
  loadActiveProjectId,
  loadProjects,
  saveActiveProjectId,
  saveProjects,
  type StoredConfig,
  type StoredLayer,
  type StoredOutput,
  type StoredProject,
  type StoredProjectSummary,
  type StoredTrait,
} from './db';

const SUPPORTED_EXTENSIONS = new Set(['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg']);

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix = 'id'): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || 'layer'
  );
}

function extFromName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) return 'png';
  const ext = fileName.slice(dot + 1).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext) ? ext : 'png';
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? fileName : fileName.slice(0, dot);
}

function projectRoot(id: string): string {
  return `opfs:project/${id}`;
}

function traitDir(projectId: string, layer: StoredLayer): string {
  return `projects/${projectId}/traits/${layer.directoryName}`;
}

function traitBlobPath(projectId: string, layer: StoredLayer, fileName: string): string {
  return `${traitDir(projectId, layer)}/${fileName}`;
}

function outputBlobPath(projectId: string, tokenId: number): string {
  return `projects/${projectId}/outputs/${String(tokenId).padStart(6, '0')}.png`;
}

function toTraitAsset(layer: StoredLayer, trait: StoredTrait): TraitAsset {
  return {
    id: trait.id,
    name: trait.displayName,
    relativePath: `${layer.directoryName}/${trait.fileName}`,
    extension: trait.extension,
    version: trait.version,
  };
}

function toTraitLayer(layer: StoredLayer): TraitLayer {
  return {
    id: layer.id,
    name: layer.name,
    directoryName: layer.directoryName,
    traits: layer.traits.map((trait) => toTraitAsset(layer, trait)),
  };
}

function toTraitLibrary(project: StoredProject): TraitLibrary {
  const layers = [...project.layers]
    .sort((a, b) => a.order - b.order)
    .filter((layer) => layer.enabled)
    .map(toTraitLayer);
  return {
    rootDir: projectRoot(project.id),
    layers,
  };
}

function findLayerByDir(project: StoredProject, directoryName: string): StoredLayer | undefined {
  return project.layers.find((layer) => layer.directoryName === directoryName);
}

function findLayerByName(project: StoredProject, layerName: string): StoredLayer | undefined {
  const normalized = layerName.trim().toLowerCase();
  return project.layers.find((layer) => layer.name.trim().toLowerCase() === normalized);
}

function findTraitByRelativePath(project: StoredProject, relativePath: string): {
  layer: StoredLayer;
  trait: StoredTrait;
} | null {
  const [directoryName, ...rest] = relativePath.split('/');
  if (!directoryName || rest.length === 0) return null;
  const fileName = rest.join('/');
  const layer = findLayerByDir(project, directoryName);
  if (!layer) return null;
  const trait = layer.traits.find((t) => t.fileName === fileName);
  if (!trait) return null;
  return { layer, trait };
}

interface Listener {
  (): void;
}

class AssetStoreClient {
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;
  private projects: StoredProject[] = [];
  private activeId: string | null = null;
  private urlCache = new Map<string, { url: string; version: number }>();
  private urlLoads = new Map<string, Promise<void>>();
  private listeners = new Set<Listener>();
  private notifyScheduled = false;

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  // Coalesce bursts of async URL-cache fills (opening a 800-trait picker fires
  // one notify per finished blob → one global re-render per notify → each panel
  // re-iterates every trait). One tick, one notify.
  private notifyBatched(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      this.notify();
    });
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private async ensureHydrated(): Promise<void> {
    if (this.hydrated) return;
    if (!this.hydratePromise) {
      this.hydratePromise = (async () => {
        this.projects = await loadProjects();
        this.activeId = await loadActiveProjectId();
        if (!this.activeId && this.projects.length > 0) {
          this.activeId = this.projects[0].id;
          await saveActiveProjectId(this.activeId);
        }
        this.hydrated = true;
      })();
    }
    return this.hydratePromise;
  }

  private async persist(): Promise<void> {
    await saveProjects(this.projects);
  }

  private async touch(project: StoredProject): Promise<void> {
    project.updatedAt = nowIso();
    await this.persist();
    this.notify();
  }

  async hydrate(): Promise<void> {
    await this.ensureHydrated();
    this.notify();
  }

  async listProjects(): Promise<StoredProjectSummary[]> {
    await this.ensureHydrated();
    return this.projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));
  }

  getActiveProjectIdSync(): string | null {
    return this.activeId;
  }

  async getActiveProject(): Promise<StoredProject | null> {
    await this.ensureHydrated();
    if (!this.activeId) return null;
    return this.projects.find((project) => project.id === this.activeId) ?? null;
  }

  async ensureDefaultProject(name = 'Untitled Collection'): Promise<StoredProject> {
    await this.ensureHydrated();
    const active = await this.getActiveProject();
    if (active) return active;
    return this.createProject(name);
  }

  async createProject(name: string): Promise<StoredProject> {
    await this.ensureHydrated();
    const project: StoredProject = {
      id: randomId('proj'),
      name: name.trim() || 'Untitled Collection',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      layers: [],
      configs: [],
      outputs: [],
      collectionName: name.trim() || 'Untitled Collection',
      collectionDescription: '',
    };
    this.projects.push(project);
    this.activeId = project.id;
    await saveActiveProjectId(this.activeId);
    await this.persist();
    this.notify();
    return project;
  }

  async renameProject(id: string, name: string): Promise<void> {
    await this.ensureHydrated();
    const project = this.projects.find((entry) => entry.id === id);
    if (!project) return;
    const trimmed = name.trim() || project.name;
    project.name = trimmed;
    project.collectionName = trimmed;
    await this.touch(project);
  }

  async deleteProject(id: string): Promise<void> {
    await this.ensureHydrated();
    this.projects = this.projects.filter((project) => project.id !== id);
    if (this.activeId === id) {
      this.activeId = this.projects[0]?.id ?? null;
      await saveActiveProjectId(this.activeId);
    }
    await opfs.deleteDir(`projects/${id}`);
    await this.persist();
    this.notify();
  }

  async switchProject(id: string): Promise<void> {
    await this.ensureHydrated();
    if (!this.projects.some((project) => project.id === id)) return;
    this.activeId = id;
    await saveActiveProjectId(id);
    this.revokeAllBlobUrls();
    this.notify();
  }

  async getLibrary(): Promise<TraitLibrary> {
    const project = await this.ensureDefaultProject();
    return toTraitLibrary(project);
  }

  // ---------- Layers ----------

  private nextOrder(project: StoredProject): number {
    return project.layers.length === 0 ? 1 : Math.max(...project.layers.map((layer) => layer.order)) + 1;
  }

  private resolveLayerForUpload(project: StoredProject, layerName: string, preferredOrder?: number): StoredLayer {
    const existing = findLayerByName(project, layerName);
    if (existing) return existing;
    const order = preferredOrder && preferredOrder > 0 ? preferredOrder : this.nextOrder(project);
    const layer: StoredLayer = {
      id: slugify(layerName),
      name: layerName.trim(),
      directoryName: slugify(layerName),
      order,
      enabled: true,
      traits: [],
    };
    project.layers.push(layer);
    return layer;
  }

  async createLayer(layerName: string, preferredOrder?: number): Promise<TraitLibrary> {
    const project = await this.ensureDefaultProject();
    if (!layerName.trim()) throw new Error('Layer name is required.');
    if (findLayerByName(project, layerName)) throw new Error(`Layer "${layerName}" already exists.`);
    this.resolveLayerForUpload(project, layerName, preferredOrder);
    await this.touch(project);
    return toTraitLibrary(project);
  }

  async renameLayer(directoryName: string, nextName: string): Promise<{ library: TraitLibrary; meta: { renameLayer?: { oldDirectoryName: string; newDirectoryName: string } } }> {
    const project = await this.ensureDefaultProject();
    const layer = findLayerByDir(project, directoryName);
    if (!layer) throw new Error(`Layer "${directoryName}" not found.`);
    const trimmed = nextName.trim();
    if (!trimmed) throw new Error('Enter a new layer name.');
    const meta: { renameLayer?: { oldDirectoryName: string; newDirectoryName: string } } = {};
    const nextDir = slugify(trimmed);
    if (nextDir !== layer.directoryName && project.layers.some((entry) => entry.directoryName === nextDir)) {
      // Fall back to keeping the directory but changing the display name.
      layer.name = trimmed;
    } else {
      layer.name = trimmed;
      if (nextDir !== layer.directoryName) {
        // Move all trait blobs to the new directory.
        for (const trait of layer.traits) {
          const from = traitBlobPath(project.id, layer, trait.fileName);
          const to = `projects/${project.id}/traits/${nextDir}/${trait.fileName}`;
          await opfs.move(from, to);
          trait.blobPath = to;
        }
        meta.renameLayer = { oldDirectoryName: layer.directoryName, newDirectoryName: nextDir };
        layer.directoryName = nextDir;
      }
    }
    this.revokeAllBlobUrls();
    await this.touch(project);
    return { library: toTraitLibrary(project), meta };
  }

  async deleteLayer(directoryName: string): Promise<TraitLibrary> {
    const project = await this.ensureDefaultProject();
    const layer = findLayerByDir(project, directoryName);
    if (!layer) return toTraitLibrary(project);
    await opfs.deleteDir(traitDir(project.id, layer));
    project.layers = project.layers.filter((entry) => entry.directoryName !== directoryName);
    // Clean references in configs so hydrateSavedConfig doesn't need to guess.
    for (const config of project.configs) {
      config.layerOrder = config.layerOrder.filter((id) => id !== layer.id);
      delete config.selectedTraits[layer.id];
    }
    this.revokeAllBlobUrls();
    await this.touch(project);
    return toTraitLibrary(project);
  }

  async reorderLayers(orderedDirectoryNames: string[]): Promise<TraitLibrary> {
    const project = await this.ensureDefaultProject();
    orderedDirectoryNames.forEach((directoryName, index) => {
      const layer = findLayerByDir(project, directoryName);
      if (layer) layer.order = index + 1;
    });
    // Anything not in the list keeps its relative order at the tail.
    const missing = project.layers.filter((layer) => !orderedDirectoryNames.includes(layer.directoryName));
    missing.forEach((layer, index) => {
      layer.order = orderedDirectoryNames.length + index + 1;
    });
    await this.touch(project);
    return toTraitLibrary(project);
  }

  async setLayerEnabled(directoryName: string, enabled: boolean): Promise<TraitLibrary> {
    const project = await this.ensureDefaultProject();
    const layer = findLayerByDir(project, directoryName);
    if (layer) layer.enabled = enabled;
    await this.touch(project);
    return toTraitLibrary(project);
  }

  // ---------- Traits ----------

  async uploadTrait(input: {
    layerName: string;
    fileName: string;
    blob: Blob;
    displayName?: string;
    preferredOrder?: number;
  }): Promise<{
    library: TraitLibrary;
    upload: { layerDirectoryName: string; fileName: string; relativePath: string };
  }> {
    const project = await this.ensureDefaultProject();
    const layer = this.resolveLayerForUpload(project, input.layerName, input.preferredOrder);
    const cleanedFile = input.fileName.trim() || 'trait.png';
    const ext = extFromName(cleanedFile);
    const baseName = stripExtension(cleanedFile).replace(/[\\/:*?"<>|]/g, ' ').trim() || 'trait';

    let candidate = `${baseName}.${ext}`;
    let suffix = 1;
    while (layer.traits.some((trait) => trait.fileName.toLowerCase() === candidate.toLowerCase())) {
      suffix += 1;
      candidate = `${baseName}-${suffix}.${ext}`;
    }
    const finalName = candidate;
    const blobPath = traitBlobPath(project.id, layer, finalName);
    await opfs.putBlob(blobPath, input.blob);

    const trait: StoredTrait = {
      id: `${slugify(layer.name)}--${slugify(input.displayName || baseName)}--${randomId('t')}`,
      displayName: input.displayName?.trim() || baseName,
      fileName: finalName,
      extension: ext,
      blobPath,
      weight: DEFAULT_TRAIT_WEIGHT,
      version: Date.now(),
    };
    layer.traits.push(trait);
    await this.touch(project);
    return {
      library: toTraitLibrary(project),
      upload: {
        layerDirectoryName: layer.directoryName,
        fileName: finalName,
        relativePath: `${layer.directoryName}/${finalName}`,
      },
    };
  }

  async renameTrait(relativePath: string, nextName: string): Promise<{
    library: TraitLibrary;
    meta: { renameTrait?: { oldRelativePath: string; newRelativePath: string } };
  }> {
    const project = await this.ensureDefaultProject();
    const found = findTraitByRelativePath(project, relativePath);
    if (!found) throw new Error(`Trait "${relativePath}" not found.`);
    const { layer, trait } = found;
    const cleaned = nextName.trim();
    if (!cleaned) throw new Error('Enter a new trait name.');
    trait.displayName = stripExtension(cleaned) || trait.displayName;
    trait.version = Date.now();
    this.invalidateUrl(trait.blobPath);
    await this.touch(project);
    return {
      library: toTraitLibrary(project),
      meta: { renameTrait: { oldRelativePath: relativePath, newRelativePath: `${layer.directoryName}/${trait.fileName}` } },
    };
  }

  async deleteTrait(relativePath: string): Promise<TraitLibrary> {
    const project = await this.ensureDefaultProject();
    const found = findTraitByRelativePath(project, relativePath);
    if (!found) return toTraitLibrary(project);
    await opfs.deleteBlob(found.trait.blobPath);
    this.invalidateUrl(found.trait.blobPath);
    found.layer.traits = found.layer.traits.filter((entry) => entry.fileName !== found.trait.fileName);
    for (const config of project.configs) {
      for (const [layerId, traitId] of Object.entries(config.selectedTraits)) {
        if (traitId === found.trait.id) delete config.selectedTraits[layerId];
      }
    }
    await this.touch(project);
    return toTraitLibrary(project);
  }

  async replaceTrait(relativePath: string, blob: Blob): Promise<{
    library: TraitLibrary;
    replacement: { relativePath: string; fileName: string };
  }> {
    const project = await this.ensureDefaultProject();
    const found = findTraitByRelativePath(project, relativePath);
    if (!found) throw new Error(`Trait "${relativePath}" not found.`);
    await opfs.putBlob(found.trait.blobPath, blob);
    found.trait.version = Date.now();
    this.invalidateUrl(found.trait.blobPath);
    await this.touch(project);
    return {
      library: toTraitLibrary(project),
      replacement: { relativePath, fileName: found.trait.fileName },
    };
  }

  // ---------- Weights ----------

  async getWeights(): Promise<TraitWeights> {
    const project = await this.ensureDefaultProject();
    const weights: TraitWeights = {};
    for (const layer of project.layers) {
      for (const trait of layer.traits) {
        const relativePath = `${layer.directoryName}/${trait.fileName}`;
        weights[relativePath] = trait.weight ?? DEFAULT_TRAIT_WEIGHT;
      }
    }
    return weights;
  }

  async setWeights(weights: TraitWeights): Promise<TraitWeights> {
    const project = await this.ensureDefaultProject();
    for (const layer of project.layers) {
      for (const trait of layer.traits) {
        const relativePath = `${layer.directoryName}/${trait.fileName}`;
        const next = weights[relativePath];
        if (typeof next === 'number' && Number.isFinite(next) && next >= 0) {
          trait.weight = Math.max(0, Math.min(10000, next));
        }
      }
    }
    await this.touch(project);
    return this.getWeights();
  }

  // ---------- Configs ----------

  async listConfigs(): Promise<Array<StoredConfig & { rootDir: string; rawJson: string; fileName: string }>> {
    const project = await this.ensureDefaultProject();
    const rootDir = projectRoot(project.id);
    return project.configs.map((config) => ({
      ...config,
      effects: normalizePreviewEffects(config.effects),
      rules: normalizeCollectionRules(config.rules),
      rootDir,
      rawJson: config.rawJson ?? JSON.stringify(config, null, 2),
      fileName: `${config.id}.json`,
    }));
  }

  async saveConfig(input: {
    id: string;
    name: string;
    layerOrder: string[];
    selectedTraits: Record<string, string>;
    effects: PreviewEffect[];
    rules: CollectionRules;
    rawJson?: string;
  }): Promise<Array<StoredConfig & { rootDir: string; rawJson: string; fileName: string }>> {
    const project = await this.ensureDefaultProject();
    const now = nowIso();
    const stored: StoredConfig = {
      id: input.id,
      name: input.name,
      layerOrder: [...input.layerOrder],
      selectedTraits: { ...input.selectedTraits },
      effects: normalizePreviewEffects(input.effects),
      rules: normalizeCollectionRules(input.rules),
      updatedAt: now,
      rawJson: input.rawJson,
    };
    const index = project.configs.findIndex((entry) => entry.id === input.id);
    if (index === -1) project.configs.push(stored);
    else project.configs[index] = stored;
    await this.touch(project);
    return this.listConfigs();
  }

  async deleteConfig(configId: string): Promise<Array<StoredConfig & { rootDir: string; rawJson: string; fileName: string }>> {
    const project = await this.ensureDefaultProject();
    project.configs = project.configs.filter((config) => config.id !== configId);
    await this.touch(project);
    return this.listConfigs();
  }

  // ---------- Outputs ----------

  async saveOutput(input: StoredOutput & { blob: Blob }): Promise<void> {
    const project = await this.ensureDefaultProject();
    await opfs.putBlob(input.blobPath, input.blob);
    const existing = project.outputs.findIndex((output) => output.tokenId === input.tokenId);
    const record: StoredOutput = {
      tokenId: input.tokenId,
      blobPath: input.blobPath,
      traits: input.traits,
      isStatic: input.isStatic,
      customName: input.customName,
      customDescription: input.customDescription,
      customAttributes: input.customAttributes,
    };
    if (existing === -1) project.outputs.push(record);
    else project.outputs[existing] = record;
    await this.touch(project);
  }

  async listOutputs(): Promise<StoredOutput[]> {
    const project = await this.ensureDefaultProject();
    return [...project.outputs].sort((a, b) => a.tokenId - b.tokenId);
  }

  async getOutputBlob(tokenId: number): Promise<Blob | null> {
    const project = await this.ensureDefaultProject();
    const output = project.outputs.find((entry) => entry.tokenId === tokenId);
    if (!output) return null;
    return opfs.getBlob(output.blobPath);
  }

  async clearOutputs(): Promise<void> {
    const project = await this.ensureDefaultProject();
    await opfs.deleteDir(`projects/${project.id}/outputs`);
    project.outputs = [];
    await this.touch(project);
  }

  async clearGeneratedOutputs(): Promise<void> {
    const project = await this.ensureDefaultProject();
    const kept = project.outputs.filter((output) => output.isStatic);
    for (const output of project.outputs) {
      if (!output.isStatic) await opfs.deleteBlob(output.blobPath);
    }
    project.outputs = kept;
    await this.touch(project);
  }

  async deleteToken(tokenId: number): Promise<void> {
    const project = await this.ensureDefaultProject();
    const output = project.outputs.find((entry) => entry.tokenId === tokenId);
    if (!output) return;
    await opfs.deleteBlob(output.blobPath);
    project.outputs = project.outputs.filter((entry) => entry.tokenId !== tokenId);
    await this.touch(project);
  }

  private nextStaticTokenId(project: StoredProject): number {
    const max = project.outputs.reduce((m, o) => (o.tokenId > m ? o.tokenId : m), 0);
    return max + 1;
  }

  async addStaticToken(input: {
    blob: Blob;
    name?: string;
    description?: string;
    attributes?: Array<{ trait_type: string; value: string }>;
    traits?: Array<{ layerName: string; traitName: string }>;
  }): Promise<StoredOutput> {
    const project = await this.ensureDefaultProject();
    const tokenId = this.nextStaticTokenId(project);
    const blobPath = outputBlobPath(project.id, tokenId);
    await opfs.putBlob(blobPath, input.blob);
    const record: StoredOutput = {
      tokenId,
      blobPath,
      traits: input.traits ?? [],
      isStatic: true,
      customName: input.name?.trim() || undefined,
      customDescription: input.description?.trim() || undefined,
      customAttributes: input.attributes && input.attributes.length > 0 ? input.attributes : undefined,
    };
    project.outputs.push(record);
    await this.touch(project);
    return record;
  }

  async updateStaticTokenMeta(
    tokenId: number,
    patch: {
      name?: string;
      description?: string;
      attributes?: Array<{ trait_type: string; value: string }>;
    },
  ): Promise<StoredOutput | null> {
    const project = await this.ensureDefaultProject();
    const output = project.outputs.find((entry) => entry.tokenId === tokenId);
    if (!output || !output.isStatic) return null;
    if (patch.name !== undefined) output.customName = patch.name.trim() || undefined;
    if (patch.description !== undefined) output.customDescription = patch.description.trim() || undefined;
    if (patch.attributes !== undefined) {
      output.customAttributes = patch.attributes.length > 0 ? patch.attributes : undefined;
    }
    await this.touch(project);
    return output;
  }

  async staticTokenCount(): Promise<number> {
    const project = await this.ensureDefaultProject();
    return project.outputs.filter((entry) => entry.isStatic).length;
  }

  async rerollToken(tokenId: number, rules: CollectionRules, weights: TraitWeights): Promise<StoredOutput | null> {
    const project = await this.ensureDefaultProject();
    const output = project.outputs.find((entry) => entry.tokenId === tokenId);
    if (!output) return null;
    if (output.isStatic) throw new Error('Cannot reroll a 1-of-1 token.');

    const library = toTraitLibrary(project);
    const normalized = normalizeCollectionRules(rules);
    const existingSignatures = new Set<string>();
    for (const other of project.outputs) {
      if (other.tokenId === tokenId) continue;
      const sig = other.traits
        .map((t) => `${t.layerName}:${t.traitName}`)
        .sort()
        .join('|');
      if (sig) existingSignatures.add(sig);
    }

    const MAX_ATTEMPTS = 200;
    let selection: Record<string, string> = {};
    let attempt = 0;
    let signature = '';
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      const rolled = rollFromTemplate(library.layers, normalized.template, weights, Math.random, {
        traitPairs: normalized.traitPairs,
        traitConflicts: normalized.traitConflicts,
        layerExclusions: normalized.layerExclusions,
      });
      if (Object.keys(rolled.selection).length === 0) continue;
      signature = library.layers
        .map((layer) => {
          const traitId = rolled.selection[layer.id];
          if (!traitId) return null;
          const trait = layer.traits.find((t) => t.id === traitId);
          if (!trait) return null;
          return `${layer.name}:${trait.name}`;
        })
        .filter((s): s is string => Boolean(s))
        .sort()
        .join('|');
      if (!existingSignatures.has(signature)) {
        selection = rolled.selection;
        break;
      }
    }
    if (!signature) throw new Error('Could not find a valid combination for this token.');

    const hydrated = await hydrateLayersForRender(library.layers, (relativePath) =>
      this.getBlobForTraitPath(relativePath),
    );
    const { blob, traits } = await renderToken({ layers: hydrated, selection });
    await opfs.putBlob(output.blobPath, blob);
    output.traits = traits.map((t) => ({ layerName: t.layerName, traitName: t.traitName }));
    await this.touch(project);
    return output;
  }

  async replaceTokenTraits(tokenId: number, selection: Record<string, string>): Promise<StoredOutput | null> {
    const project = await this.ensureDefaultProject();
    const output = project.outputs.find((entry) => entry.tokenId === tokenId);
    if (!output) return null;

    const library = toTraitLibrary(project);
    const hydrated = await hydrateLayersForRender(library.layers, (relativePath) =>
      this.getBlobForTraitPath(relativePath),
    );
    const { blob, traits } = await renderToken({ layers: hydrated, selection });
    await opfs.putBlob(output.blobPath, blob);
    output.traits = traits.map((t) => ({ layerName: t.layerName, traitName: t.traitName }));
    await this.touch(project);
    return output;
  }

  async renderComposite(selection: Record<string, string>): Promise<Blob> {
    const project = await this.ensureDefaultProject();
    const library = toTraitLibrary(project);
    const hydrated = await hydrateLayersForRender(library.layers, (relativePath) =>
      this.getBlobForTraitPath(relativePath),
    );
    const { blob } = await renderToken({ layers: hydrated, selection });
    return blob;
  }

  buildOutputPath(tokenId: number): string {
    const id = this.activeId;
    if (!id) throw new Error('No active project.');
    return outputBlobPath(id, tokenId);
  }

  async setCollectionMeta(collectionName: string, description: string): Promise<void> {
    const project = await this.ensureDefaultProject();
    project.collectionName = collectionName.trim() || project.name;
    project.collectionDescription = description;
    await this.touch(project);
  }

  async getCollectionMeta(): Promise<{ collectionName: string; description: string }> {
    const project = await this.ensureDefaultProject();
    return {
      collectionName: project.collectionName || project.name,
      description: project.collectionDescription || '',
    };
  }

  // ---------- Cascade impact helpers ----------

  async impactOfDeletingLayer(directoryName: string): Promise<{
    layer: TraitLayer | null;
    traitsAffected: number;
    rulesAffected: {
      alwaysMarked: boolean;
      neverMarked: boolean;
      exclusionSourceCount: number;
      exclusionTargetCount: number;
      traitPairsAffected: number;
      traitConflictsAffected: number;
      configReferences: number;
    };
  }> {
    const project = await this.ensureDefaultProject();
    const layer = findLayerByDir(project, directoryName);
    if (!layer) {
      return {
        layer: null,
        traitsAffected: 0,
        rulesAffected: {
          alwaysMarked: false,
          neverMarked: false,
          exclusionSourceCount: 0,
          exclusionTargetCount: 0,
          traitPairsAffected: 0,
          traitConflictsAffected: 0,
          configReferences: 0,
        },
      };
    }
    let configReferences = 0;
    let alwaysMarked = false;
    let neverMarked = false;
    let exclusionSourceCount = 0;
    let exclusionTargetCount = 0;
    let traitPairsAffected = 0;
    let traitConflictsAffected = 0;
    const traitPaths = new Set(layer.traits.map((trait) => `${layer.directoryName}/${trait.fileName}`));
    for (const config of project.configs) {
      if (config.layerOrder.includes(layer.id) || config.selectedTraits[layer.id]) configReferences += 1;
      const rules = normalizeCollectionRules(config.rules);
      if (rules.template.alwaysLayerIds.includes(layer.id)) alwaysMarked = true;
      if (rules.template.neverLayerIds.includes(layer.id)) neverMarked = true;
      for (const rule of rules.layerExclusions) {
        if (rule.sourceLayerId === layer.id) exclusionSourceCount += 1;
        if (rule.excludeLayerIds.includes(layer.id)) exclusionTargetCount += 1;
      }
      for (const pair of rules.traitPairs) {
        if (traitPaths.has(pair.a) || traitPaths.has(pair.b)) traitPairsAffected += 1;
      }
      for (const conflict of rules.traitConflicts) {
        if (traitPaths.has(conflict.a) || traitPaths.has(conflict.b)) traitConflictsAffected += 1;
      }
    }
    return {
      layer: toTraitLayer(layer),
      traitsAffected: layer.traits.length,
      rulesAffected: {
        alwaysMarked,
        neverMarked,
        exclusionSourceCount,
        exclusionTargetCount,
        traitPairsAffected,
        traitConflictsAffected,
        configReferences,
      },
    };
  }

  async impactOfDeletingTrait(relativePath: string): Promise<{
    weightSet: boolean;
    excludedInRules: boolean;
    traitPairsAffected: number;
    traitConflictsAffected: number;
    selectedInConfigs: number;
  }> {
    const project = await this.ensureDefaultProject();
    const found = findTraitByRelativePath(project, relativePath);
    let weightSet = false;
    let excludedInRules = false;
    let traitPairsAffected = 0;
    let traitConflictsAffected = 0;
    let selectedInConfigs = 0;
    if (found) {
      weightSet = (found.trait.weight ?? DEFAULT_TRAIT_WEIGHT) !== DEFAULT_TRAIT_WEIGHT;
      for (const config of project.configs) {
        if (Object.values(config.selectedTraits).includes(found.trait.id)) selectedInConfigs += 1;
        const rules = normalizeCollectionRules(config.rules);
        if (rules.template.excludedTraitPaths.includes(relativePath)) excludedInRules = true;
        for (const pair of rules.traitPairs) {
          if (pair.a === relativePath || pair.b === relativePath) traitPairsAffected += 1;
        }
        for (const conflict of rules.traitConflicts) {
          if (conflict.a === relativePath || conflict.b === relativePath) traitConflictsAffected += 1;
        }
      }
    }
    return { weightSet, excludedInRules, traitPairsAffected, traitConflictsAffected, selectedInConfigs };
  }

  // ---------- Asset URL cache ----------

  buildAssetUrl(_rootDir: string, asset: TraitAsset): string {
    if (typeof window === 'undefined') return '';
    const project = this.projects.find((entry) => entry.id === this.activeId);
    if (!project) return '';
    const [directoryName, ...rest] = asset.relativePath.split('/');
    if (!directoryName || rest.length === 0) return '';
    const layer = findLayerByDir(project, directoryName);
    if (!layer) return '';
    const trait = layer.traits.find((entry) => entry.fileName === rest.join('/'));
    if (!trait) return '';
    const cached = this.urlCache.get(trait.blobPath);
    if (cached && cached.version === trait.version) return cached.url;
    if (cached) {
      URL.revokeObjectURL(cached.url);
      this.urlCache.delete(trait.blobPath);
    }
    // Lazy-load the object URL. Returns empty for the first render; refreshes
    // on the next render (via subscription bump) once the blob URL is ready.
    // De-dupe concurrent asks for the same blob so a picker with N panels
    // subscribed doesn't fire N OPFS reads for the same trait.
    if (!this.urlLoads.has(trait.blobPath)) {
      const load = (async () => {
        const blob = await opfs.getBlob(trait.blobPath);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        this.urlCache.set(trait.blobPath, { url, version: trait.version });
        this.notifyBatched();
      })().finally(() => {
        this.urlLoads.delete(trait.blobPath);
      });
      this.urlLoads.set(trait.blobPath, load);
    }
    return cached?.url ?? '';
  }

  invalidateUrl(blobPath: string): void {
    const cached = this.urlCache.get(blobPath);
    if (cached) {
      URL.revokeObjectURL(cached.url);
      this.urlCache.delete(blobPath);
    }
  }

  revokeAllBlobUrls(): void {
    for (const { url } of this.urlCache.values()) URL.revokeObjectURL(url);
    this.urlCache.clear();
  }

  async getBlobForTraitPath(relativePath: string): Promise<Blob | null> {
    const project = await this.ensureDefaultProject();
    const found = findTraitByRelativePath(project, relativePath);
    if (!found) return null;
    return opfs.getBlob(found.trait.blobPath);
  }

  async getBlobForTraitId(traitId: string): Promise<Blob | null> {
    const project = await this.ensureDefaultProject();
    for (const layer of project.layers) {
      const trait = layer.traits.find((entry) => entry.id === traitId);
      if (trait) return opfs.getBlob(trait.blobPath);
    }
    return null;
  }
}

let singleton: AssetStoreClient | null = null;

export function getAssetStore(): AssetStoreClient {
  if (!singleton) {
    singleton = new AssetStoreClient();
  }
  return singleton;
}

export type AssetStore = AssetStoreClient;

function subscribeStore(listener: () => void): () => void {
  return getAssetStore().subscribe(listener);
}

function getStoreSnapshot(): number {
  return snapshotVersion;
}

function getServerSnapshot(): number {
  return 0;
}

let snapshotVersion = 0;
if (typeof window !== 'undefined') {
  getAssetStore().subscribe(() => {
    snapshotVersion += 1;
  });
}

export function useAssetStoreVersion(): number {
  return useSyncExternalStore(subscribeStore, getStoreSnapshot, getServerSnapshot);
}

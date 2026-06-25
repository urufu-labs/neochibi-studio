'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { buildNewTraitFileName, normalizePendingNewTrait } from '@/lib/art-generator/paste-traits';
import { createSavedConfig, hydrateSavedConfig, type StoredGeneratorConfigFile } from '@/lib/art-generator/presets';
import { fetchDefaultRoot, writeStoredRootDir } from '@/lib/art-generator/root';
import {
  DEFAULT_TEMPLATES,
  getTemplateLayerRule,
  getLayerTemplateState,
  pickTemplateKind,
  pickWeightedTrait,
  rollFromTemplate,
  setLayerTemplateState,
  setTemplateLayerRule,
  simulateCollection,
  templateCapacity,
  type CollectionTemplates,
  type SimulationResult,
  type TemplateKind,
} from '@/lib/art-generator/rules';
import { DEFAULT_TRAIT_WEIGHT, type TraitWeights } from '@/lib/art-generator/weights';
import {
  applyPreviewEffectPreset,
  DEFAULT_PREVIEW_EFFECTS,
  normalizePreviewEffects,
  PREVIEW_EFFECT_PRESETS,
  scaleEffectsForRender,
  type PreviewEffect,
} from '@/lib/art-generator/canvas-filters';
import type { TraitAsset, TraitLayer, TraitLibrary } from '@/lib/art-generator/types';
import { PreviewCanvas } from '@/components/preview-canvas';
import { GalleryTile } from '@/components/gallery-tile';
import { TraitPicker } from '@/components/trait-picker';

interface LoadableState {
  loading: boolean;
  error: string | null;
}

interface ManageState {
  loading: boolean;
  error: string | null;
  success: string | null;
}

interface PastedImage {
  id: string;
  name: string;
  dataUrl: string;
  source: 'paste' | 'upload';
}

interface PendingNewTraitDraft {
  layerName: string;
  traitName: string;
  autoCreateOnPaste: boolean;
}

function moveLayerOrder(items: string[], fromIndex: number, toIndex: number): string[] {
  const target = Math.max(0, Math.min(items.length - 1, toIndex));
  if (fromIndex === target) {
    return items;
  }

  const clone = [...items];
  const [item] = clone.splice(fromIndex, 1);
  clone.splice(target, 0, item);
  return clone;
}

function pickRandomTraits(layers: TraitLayer[], weights: TraitWeights = {}): Record<string, string> {
  return layers.reduce<Record<string, string>>((selection, layer) => {
    if (layer.traits.length === 0) return selection;
    const picked = pickWeightedTrait(layer.traits, weights);
    if (picked) selection[layer.id] = picked.id;
    return selection;
  }, {});
}

function buildPreviewSelectionFromGallerySeed(
  layers: TraitLayer[],
  seedSelection: Record<string, string>,
): Record<string, string> {
  return layers.reduce<Record<string, string>>((selection, layer) => {
    const traitId = seedSelection[layer.id] ?? '';
    selection[layer.id] = layer.traits.some((trait) => trait.id === traitId) ? traitId : '';
    return selection;
  }, {});
}

function buildAssetUrl(rootDir: string, asset: TraitAsset): string {
  const params = new URLSearchParams({
    root: rootDir,
    asset: asset.relativePath,
  });
  if (asset.version) {
    params.set('v', String(asset.version));
  }

  return `/api/art-generator/asset?${params.toString()}`;
}

function buildNextSelection(
  prevLibrary: TraitLibrary | null,
  nextLibrary: TraitLibrary,
  previous: Record<string, string> = {},
  traitPathRemap: Record<string, string> = {},
): Record<string, string> {
  const prevIdToPath = new Map<string, string>();
  if (prevLibrary) {
    for (const layer of prevLibrary.layers) {
      for (const trait of layer.traits) {
        prevIdToPath.set(trait.id, trait.relativePath);
      }
    }
  }

  return nextLibrary.layers.reduce<Record<string, string>>((selection, layer) => {
    const prev = previous[layer.id];

    if (prev === '') {
      selection[layer.id] = '';
      return selection;
    }

    if (prev === undefined) {
      if (layer.traits[0]) selection[layer.id] = layer.traits[0].id;
      return selection;
    }

    let targetPath = prevIdToPath.get(prev);
    if (targetPath && traitPathRemap[targetPath]) {
      targetPath = traitPathRemap[targetPath];
    }

    let resolved: TraitAsset | undefined;
    if (targetPath) {
      resolved = layer.traits.find((trait) => trait.relativePath === targetPath);
    }
    if (!resolved) {
      resolved = layer.traits.find((trait) => trait.id === prev);
    }

    if (resolved) {
      selection[layer.id] = resolved.id;
    } else if (layer.traits[0]) {
      selection[layer.id] = layer.traits[0].id;
    }

    return selection;
  }, {});
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  templateA: 'Template A',
  templateB: 'Template B',
};

const PRESET_EFFECTS_BY_ID: Record<string, PreviewEffect[]> = Object.fromEntries(
  PREVIEW_EFFECT_PRESETS.map((preset) => [preset.id, applyPreviewEffectPreset(DEFAULT_PREVIEW_EFFECTS, preset)]),
);

const NO_EFFECTS: PreviewEffect[] = DEFAULT_PREVIEW_EFFECTS;

// Approximate CSS display size per gallery tile size class. Used to scale
// pixel-counted effect params so features land at the same CSS-pixel size as
// the main preview (which renders 1024 → ~760 CSS).
const GALLERY_TILE_DIMENSIONS = {
  s: { render: 256, display: 96 },
  m: { render: 256, display: 160 },
  l: { render: 384, display: 240 },
  xl: { render: 512, display: 360 },
} as const;

export function ArtGeneratorStudio() {
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  const [rootDirInput, setRootDirInput] = useState('');
  const [library, setLibrary] = useState<TraitLibrary | null>(null);
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [selectedTraits, setSelectedTraits] = useState<Record<string, string>>({});
  const [state, setState] = useState<LoadableState>({ loading: false, error: null });

  const [uploadLayerName, setUploadLayerName] = useState('');

  const [exportName, setExportName] = useState('');
  const [effects, setEffects] = useState<PreviewEffect[]>(() => [...DEFAULT_PREVIEW_EFFECTS]);

  const [templates, setTemplates] = useState<CollectionTemplates>(() => ({
    templateA: { ...DEFAULT_TEMPLATES.templateA, excludedTraitPaths: [], layerRules: [] },
    templateB: { ...DEFAULT_TEMPLATES.templateB, excludedTraitPaths: [], layerRules: [] },
    templateAWeight: DEFAULT_TEMPLATES.templateAWeight,
    traitPairs: [],
    layerExclusions: [],
  }));
  const [traitWeights, setTraitWeights] = useState<TraitWeights>({});
  const traitWeightsHydratedRef = useRef(false);
  const traitWeightsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [targetCollectionSize, setTargetCollectionSize] = useState(10000);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationRunning, setSimulationRunning] = useState(false);

  const [manageState, setManageState] = useState<ManageState>({ loading: false, error: null, success: null });

  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerOrder, setNewLayerOrder] = useState('');
  const [renameLayerDrafts, setRenameLayerDrafts] = useState<Record<string, string>>({});
  const [renameTraitDrafts, setRenameTraitDrafts] = useState<Record<string, string>>({});
  const [replaceTargetAssetPath, setReplaceTargetAssetPath] = useState('');
  const [pendingNewTrait, setPendingNewTrait] = useState<PendingNewTraitDraft | null>(null);
  const [pendingReplaceTarget, setPendingReplaceTarget] = useState<{ relativePath: string; layerName: string; traitName: string } | null>(null);
  const [lastPastedImageId, setLastPastedImageId] = useState<string | null>(null);

  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);

  const [pairDraftA, setPairDraftA] = useState('');
  const [pairDraftB, setPairDraftB] = useState('');
  const [exclusionDraftSource, setExclusionDraftSource] = useState('');

  type StudioTab = 'library' | 'templates' | null;
  const [activeTab, setActiveTab] = useState<StudioTab>(null);
  const [gallerySeeds, setGallerySeeds] = useState<Array<{ kind: TemplateKind; selection: Record<string, string>; presetId: string | null }>>([]);
  const [galleryTileCount, setGalleryTileCount] = useState(16);
  const [galleryEffectsEnabled, setGalleryEffectsEnabled] = useState(true);
  const [activeGalleryTileIndex, setActiveGalleryTileIndex] = useState<number | null>(null);
  type GalleryTileSize = 's' | 'm' | 'l' | 'xl';
  const [galleryTileSize, setGalleryTileSize] = useState<GalleryTileSize>('m');
  const galleryCanvasSize = GALLERY_TILE_DIMENSIONS[galleryTileSize].render;
  const galleryDisplaySize = GALLERY_TILE_DIMENSIONS[galleryTileSize].display;
  const tileScaledPresetEffects = useMemo(() => {
    const out: Record<string, PreviewEffect[]> = {};
    for (const [id, baseEffects] of Object.entries(PRESET_EFFECTS_BY_ID)) {
      out[id] = scaleEffectsForRender(baseEffects, galleryCanvasSize, galleryDisplaySize);
    }
    return out;
  }, [galleryCanvasSize, galleryDisplaySize]);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const previousLibraryRef = useRef<TraitLibrary | null>(null);
  const AUTOSAVE_ID = '_autosave';

  useEffect(() => {
    void loadDefaultRoot();
  }, []);

  useEffect(() => {
    if (!library) return;
    rerollGallery(galleryTileCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, galleryTileCount, templates, traitWeights]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.items ?? []).filter((item) => item.type.startsWith('image/'));
      if (items.length === 0) {
        return;
      }

      event.preventDefault();
      void Promise.all(
        items.map(async (item, index) => {
          const file = item.getAsFile();
          if (!file) {
            return null;
          }

          return {
            id: crypto.randomUUID(),
            name: file.name || `pasted-image-${Date.now()}-${index}.png`,
            dataUrl: await readFileAsDataUrl(file),
            source: 'paste',
          } satisfies PastedImage;
        }),
      ).then((images) => {
        const nextImages = images.filter((image): image is (typeof images)[number] & PastedImage => Boolean(image));
        if (nextImages.length === 0) {
          return;
        }

        setPastedImages((current) => {
          const merged = [...nextImages, ...current];
          setLastPastedImageId(merged[0]?.id ?? null);
          return merged;
        });
        let successMessage = `Captured ${nextImages.length} pasted image${nextImages.length === 1 ? '' : 's'}.`;
        if (pendingReplaceTarget) {
          successMessage = `Captured paste for replace → ${pendingReplaceTarget.layerName} / ${pendingReplaceTarget.traitName}.`;
        } else if (pendingNewTrait) {
          successMessage = `Captured ${nextImages.length} pasted image${nextImages.length === 1 ? '' : 's'} for “${pendingNewTrait.layerName} / ${pendingNewTrait.traitName}”.`;
        }
        setManageState({ loading: false, error: null, success: successMessage });

        if (pendingReplaceTarget && nextImages[0]) {
          const target = pendingReplaceTarget;
          setPendingReplaceTarget(null);
          void replaceTraitWithDataUrl(nextImages[0].dataUrl, target.relativePath, `${target.traitName}.png`);
        } else if (pendingNewTrait?.autoCreateOnPaste && nextImages[0]) {
          const draft = normalizePendingNewTrait(pendingNewTrait, uploadLayerName || 'background');
          void createTraitFromDataUrl(nextImages[0].dataUrl, draft.layerName, draft.traitName);
        }
      });
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [pendingNewTrait, pendingReplaceTarget]);

  const layerMap = useMemo(() => new Map((library?.layers ?? []).map((layer) => [layer.id, layer])), [library]);
  const layerNameSuggestions = useMemo(() => (library?.layers ?? []).map((layer) => layer.name), [library]);

  const orderedLayers = useMemo(() => {
    return layerOrder
      .map((layerId) => layerMap.get(layerId))
      .filter((layer): layer is TraitLayer => Boolean(layer));
  }, [layerMap, layerOrder]);

  const capacities = useMemo(() => {
    const templateA = templateCapacity(orderedLayers, templates.templateA, traitWeights);
    const templateB = templateCapacity(orderedLayers, templates.templateB, traitWeights);
    return { templateA, templateB, total: templateA + templateB };
  }, [orderedLayers, templates, traitWeights]);

  const previewLayers = orderedLayers
    .map((layer) => {
      const traitId = selectedTraits[layer.id];
      const selectedTrait = layer.traits.find((trait) => trait.id === traitId);
      if (!selectedTrait) {
        return null;
      }

      return { layer, trait: selectedTrait };
    })
    .filter((item): item is { layer: TraitLayer; trait: TraitAsset } => Boolean(item));

  function applyLibrary(
    nextLibrary: TraitLibrary,
    previousSelection: Record<string, string> = {},
    focusRelativePath?: string,
    traitPathRemap: Record<string, string> = {},
  ) {
    const nextSelection = buildNextSelection(previousLibraryRef.current, nextLibrary, previousSelection, traitPathRemap);

    if (focusRelativePath) {
      for (const layer of nextLibrary.layers) {
        const focusedTrait = layer.traits.find((trait) => trait.relativePath === focusRelativePath);
        if (focusedTrait) {
          nextSelection[layer.id] = focusedTrait.id;
          break;
        }
      }
    }

    setLibrary(nextLibrary);
    previousLibraryRef.current = nextLibrary;
    setLayerOrder((currentOrder) => {
      const nextIds = nextLibrary.layers.map((layer) => layer.id);
      const nextIdSet = new Set(nextIds);
      const preserved = currentOrder.filter((id) => nextIdSet.has(id));
      const appended = nextIds.filter((id) => !preserved.includes(id));
      return [...preserved, ...appended];
    });
    setSelectedTraits(nextSelection);
    setUploadLayerName((current) => current || nextLibrary.layers[0]?.name || '');
    setRenameLayerDrafts(Object.fromEntries(nextLibrary.layers.map((layer) => [layer.directoryName, layer.name])));
    setRenameTraitDrafts(
      Object.fromEntries(nextLibrary.layers.flatMap((layer) => layer.traits.map((trait) => [trait.relativePath, trait.name]))),
    );
    if (focusRelativePath) {
      setReplaceTargetAssetPath(focusRelativePath);
    } else if (!replaceTargetAssetPath) {
      setReplaceTargetAssetPath(nextLibrary.layers[0]?.traits[0]?.relativePath || '');
    }
  }

  async function fetchLibrary(rootDir: string): Promise<TraitLibrary> {
    const response = await fetch(`/api/art-generator/library?${new URLSearchParams({ root: rootDir }).toString()}`);
    const payload = (await response.json()) as TraitLibrary | { error: string };

    if (!response.ok || 'error' in payload) {
      throw new Error('error' in payload ? payload.error : 'Failed to load trait assets.');
    }

    return payload;
  }

  async function fetchStoredConfigs(rootDir: string): Promise<StoredGeneratorConfigFile[]> {
    const response = await fetch(`/api/art-generator/configs?${new URLSearchParams({ root: rootDir }).toString()}`);
    const payload = (await response.json()) as { configs?: StoredGeneratorConfigFile[]; error?: string };
    if (!response.ok || payload.error || !payload.configs) {
      throw new Error(payload.error || 'Failed to load saved configs.');
    }

    return payload.configs;
  }

  async function fetchTraitWeights(rootDir: string): Promise<TraitWeights> {
    const response = await fetch(`/api/art-generator/weights?${new URLSearchParams({ root: rootDir }).toString()}`);
    const payload = (await response.json()) as { weights?: TraitWeights; error?: string };
    if (!response.ok || payload.error || !payload.weights) {
      return {};
    }
    return payload.weights;
  }

  async function loadCanonicalRoot(rootDir?: string) {
    const nextRoot = rootDir ?? (await fetchDefaultRoot());
    setRootDirInput(nextRoot);
    writeStoredRootDir(nextRoot);

    const [nextLibrary, storedConfigs, weights] = await Promise.all([
      fetchLibrary(nextRoot),
      fetchStoredConfigs(nextRoot),
      fetchTraitWeights(nextRoot),
    ]);

    const autosave = storedConfigs.find((config) => config.id === AUTOSAVE_ID);
    const hydrated = autosave ? hydrateSavedConfig({ ...autosave, rootDir: nextRoot }, nextLibrary) : null;
    const hydratedSelection = hydrated?.selectedTraits ?? selectedTraits;

    applyLibrary(nextLibrary, hydratedSelection);
    if (hydrated && hydrated.layerOrder.length > 0) {
      setLayerOrder(hydrated.layerOrder);
    }
    if (hydrated) {
      setEffects(normalizePreviewEffects(hydrated.effects));
      setTemplates(hydrated.templates);
    }
    setTraitWeights(weights);
    traitWeightsHydratedRef.current = true;
    setState({ loading: false, error: null });
    hydratedRef.current = true;
    return nextRoot;
  }

  useEffect(() => {
    if (!hydratedRef.current || !library || !rootDirInput.trim()) {
      return;
    }
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    setAutosaveStatus('saving');
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const config = createSavedConfig({
          id: AUTOSAVE_ID,
          name: 'Autosave',
          rootDir: rootDirInput.trim(),
          layerOrder,
          selectedTraits,
          effects,
          templates,
        });
        const response = await fetch('/api/art-generator/configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootDir: rootDirInput.trim(), config }),
        });
        const payload = (await response.json()) as { configs?: StoredGeneratorConfigFile[]; error?: string };
        if (!response.ok || payload.error || !payload.configs) {
          throw new Error(payload.error || 'Autosave failed.');
        }
        setAutosaveStatus('saved');
      } catch {
        setAutosaveStatus('error');
      }
    }, 700);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [layerOrder, selectedTraits, effects, templates, library, rootDirInput]);

  useEffect(() => {
    if (!traitWeightsHydratedRef.current || !rootDirInput.trim()) return;
    if (traitWeightsTimerRef.current) clearTimeout(traitWeightsTimerRef.current);
    traitWeightsTimerRef.current = setTimeout(() => {
      void fetch('/api/art-generator/weights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootDir: rootDirInput.trim(), weights: traitWeights }),
      });
    }, 700);
    return () => {
      if (traitWeightsTimerRef.current) clearTimeout(traitWeightsTimerRef.current);
    };
  }, [traitWeights, rootDirInput]);


  function updateTemplateLayerState(kind: TemplateKind, layerId: string, state: 'always' | 'never' | 'optional') {
    setTemplates((current) => ({
      ...current,
      [kind]: setLayerTemplateState(current[kind], layerId, state),
    }));
  }

  function updateTemplateLayerChance(kind: TemplateKind, layerId: string, chancePercent: number) {
    setTemplates((current) => ({
      ...current,
      [kind]: setTemplateLayerRule(current[kind], layerId, { chancePercent }),
    }));
  }

  function updateTemplateLayerSkips(kind: TemplateKind, layerId: string, excludeLayerIds: string[]) {
    setTemplates((current) => ({
      ...current,
      [kind]: setTemplateLayerRule(current[kind], layerId, { excludeLayerIds }),
    }));
  }

  function updateTemplateAWeight(weight: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(weight)));
    setTemplates((current) => ({ ...current, templateAWeight: clamped }));
  }

  function toggleTraitInTemplate(kind: TemplateKind, traitPath: string, included: boolean) {
    setTemplates((current) => {
      const tpl = current[kind];
      const set = new Set(tpl.excludedTraitPaths);
      if (included) set.delete(traitPath);
      else set.add(traitPath);
      return { ...current, [kind]: { ...tpl, excludedTraitPaths: Array.from(set) } };
    });
  }

  function setLayerTraitsInTemplate(kind: TemplateKind, layer: TraitLayer, included: boolean) {
    setTemplates((current) => {
      const tpl = current[kind];
      const set = new Set(tpl.excludedTraitPaths);
      for (const trait of layer.traits) {
        if (included) set.delete(trait.relativePath);
        else set.add(trait.relativePath);
      }
      return { ...current, [kind]: { ...tpl, excludedTraitPaths: Array.from(set) } };
    });
  }

  function addTraitPair(a: string, b: string) {
    if (!a || !b || a === b) return;
    setTemplates((current) => {
      const exists = current.traitPairs.some(
        (pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a),
      );
      if (exists) return current;
      return { ...current, traitPairs: [...current.traitPairs, { a, b }] };
    });
  }

  function removeTraitPair(index: number) {
    setTemplates((current) => ({
      ...current,
      traitPairs: current.traitPairs.filter((_, i) => i !== index),
    }));
  }

  function setLayerExclusion(sourceLayerId: string, excludeLayerIds: string[]) {
    setTemplates((current) => {
      const filtered = current.layerExclusions.filter((rule) => rule.sourceLayerId !== sourceLayerId);
      const cleaned = excludeLayerIds.filter((id) => id && id !== sourceLayerId);
      if (cleaned.length === 0) {
        return { ...current, layerExclusions: filtered };
      }
      return {
        ...current,
        layerExclusions: [...filtered, { sourceLayerId, excludeLayerIds: cleaned }],
      };
    });
  }

  function addLayerExclusion(sourceLayerId: string) {
    if (!sourceLayerId) return;
    setTemplates((current) => {
      if (current.layerExclusions.some((rule) => rule.sourceLayerId === sourceLayerId)) return current;
      return {
        ...current,
        layerExclusions: [...current.layerExclusions, { sourceLayerId, excludeLayerIds: [] }],
      };
    });
  }

  function removeLayerExclusion(sourceLayerId: string) {
    setTemplates((current) => ({
      ...current,
      layerExclusions: current.layerExclusions.filter((rule) => rule.sourceLayerId !== sourceLayerId),
    }));
  }

  function randomizeSelection() {
    if (!library) {
      return;
    }

    setActiveGalleryTileIndex(null);
    setSelectedTraits(pickRandomTraits(library.layers, traitWeights));
  }

  function randomizeLayer(layer: TraitLayer) {
    if (layer.traits.length === 0) return;
    const picked = pickWeightedTrait(layer.traits, traitWeights);
    if (picked) selectTrait(layer.id, picked.id);
  }

  function runSimulation() {
    if (orderedLayers.length === 0) return;
    setSimulationRunning(true);
    setSimulationResult(null);
    setTimeout(() => {
      const result = simulateCollection({
        layers: orderedLayers,
        layerOrder,
        templates,
        weights: traitWeights,
        targetSize: targetCollectionSize,
      });
      setSimulationResult(result);
      setSimulationRunning(false);
    }, 0);
  }

  function rerollGallery(count: number = galleryTileCount) {
    if (!library) {
      setActiveGalleryTileIndex(null);
      setGallerySeeds([]);
      return;
    }
    const next = Array.from({ length: count }, () => {
      const kind = pickTemplateKind(templates.templateAWeight);
      const { selection } = rollFromTemplate(library.layers, templates[kind], traitWeights, Math.random, {
        traitPairs: templates.traitPairs,
        layerExclusions: templates.layerExclusions,
      });
      const preset = PREVIEW_EFFECT_PRESETS.length > 0
        ? PREVIEW_EFFECT_PRESETS[Math.floor(Math.random() * PREVIEW_EFFECT_PRESETS.length)]
        : null;
      return { kind, selection, presetId: preset?.id ?? null };
    });
    setActiveGalleryTileIndex(null);
    setGallerySeeds(next);
  }

  function selectTrait(layerId: string, traitId: string) {
    setActiveGalleryTileIndex(null);
    setSelectedTraits((current) => ({
      ...current,
      [layerId]: traitId,
    }));
  }

  function loadGalleryTileSelection(seed: { selection: Record<string, string> }, index: number) {
    setSelectedTraits(buildPreviewSelectionFromGallerySeed(orderedLayers, seed.selection));
    setActiveGalleryTileIndex(index);
  }

  function reorderLayer(index: number, direction: -1 | 1) {
    setLayerOrder((current) => moveLayerOrder(current, index, index + direction));
  }

  async function manageLibraryAction(
    payload: Record<string, unknown>,
    successMessage: string,
    options: {
      focusRelativePath?: string;
      computeRemap?: (meta: Record<string, unknown>) => Record<string, string>;
    } = {},
  ) {
    const rootDir = rootDirInput.trim();
    if (!rootDir) {
      setManageState({ loading: false, error: 'Load a trait root first.', success: null });
      return;
    }

    setManageState({ loading: true, error: null, success: null });

    try {
      const response = await fetch('/api/art-generator/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootDir, ...payload }),
      });
      const body = (await response.json()) as { library?: TraitLibrary; meta?: Record<string, unknown>; error?: string };
      if (!response.ok || body.error || !body.library) {
        throw new Error(body.error || 'Failed to update trait library.');
      }

      const remap = options.computeRemap?.(body.meta ?? {}) ?? {};
      applyLibrary(body.library, selectedTraits, options.focusRelativePath, remap);
      setManageState({ loading: false, error: null, success: successMessage });
    } catch (error) {
      setManageState({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to update trait library.',
        success: null,
      });
    }
  }

  async function persistLayerOrder() {
    await manageLibraryAction(
      { action: 'reorderLayers', orderedDirectoryNames: orderedLayers.map((layer) => layer.directoryName) },
      'Persisted layer order to disk.',
    );
  }

  async function createLayer() {
    if (!newLayerName.trim()) {
      setManageState({ loading: false, error: 'Enter a new layer name first.', success: null });
      return;
    }

    await manageLibraryAction(
      {
        action: 'createLayer',
        layerName: newLayerName.trim(),
        preferredOrder: newLayerOrder.trim() ? Number(newLayerOrder) : undefined,
      },
      `Created layer “${newLayerName.trim()}”.`,
    );
    setNewLayerName('');
    setNewLayerOrder('');
  }

  async function renameLayer(layer: TraitLayer) {
    const nextLayerName = (renameLayerDrafts[layer.directoryName] || '').trim();
    if (!nextLayerName) {
      setManageState({ loading: false, error: 'Enter a replacement layer name.', success: null });
      return;
    }

    await manageLibraryAction(
      { action: 'renameLayer', layerDirectoryName: layer.directoryName, nextLayerName },
      `Renamed layer to “${nextLayerName}”.`,
    );
  }

  async function deleteLayer(layer: TraitLayer) {
    if (!window.confirm(`Delete layer “${layer.name}” and all of its traits?`)) {
      return;
    }

    await manageLibraryAction(
      { action: 'deleteLayer', layerDirectoryName: layer.directoryName },
      `Deleted layer “${layer.name}”.`,
    );
  }

  async function renameTrait(trait: TraitAsset) {
    const draft = (renameTraitDrafts[trait.relativePath] || '').trim();
    const fileName = `${draft || trait.name}.${trait.extension}`;
    await manageLibraryAction(
      { action: 'renameTrait', assetRelativePath: trait.relativePath, nextFileName: fileName },
      `Renamed trait to “${draft || trait.name}”.`,
      {
        computeRemap: (meta) => {
          const r = (meta as { renameTrait?: { oldRelativePath?: string; newRelativePath?: string } }).renameTrait;
          if (r?.oldRelativePath && r.newRelativePath) {
            return { [r.oldRelativePath]: r.newRelativePath };
          }
          return {};
        },
      },
    );
  }

  async function deleteTrait(trait: TraitAsset) {
    if (!window.confirm(`Delete trait “${trait.name}”?`)) {
      return;
    }

    await manageLibraryAction(
      { action: 'deleteTrait', assetRelativePath: trait.relativePath },
      `Deleted trait “${trait.name}”.`,
    );
  }

  async function replaceTraitWithFile(file: File, assetRelativePath: string) {
    const rootDir = rootDirInput.trim();
    if (!rootDir || !assetRelativePath) {
      setManageState({ loading: false, error: 'Choose a replacement target first.', success: null });
      return;
    }

    setManageState({ loading: true, error: null, success: null });

    try {
      const formData = new FormData();
      formData.append('rootDir', rootDir);
      formData.append('assetRelativePath', assetRelativePath);
      formData.append('file', file);

      const response = await fetch('/api/art-generator/replace', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as
        | { replacement: { relativePath: string; fileName: string }; library: TraitLibrary }
        | { error: string };

      if (!response.ok || 'error' in payload) {
        throw new Error('error' in payload ? payload.error : 'Failed to replace asset.');
      }

      applyLibrary(payload.library, selectedTraits, payload.replacement.relativePath);
      setManageState({ loading: false, error: null, success: `Replaced ${payload.replacement.fileName}.` });
      if (replaceFileInputRef.current) {
        replaceFileInputRef.current.value = '';
      }
    } catch (error) {
      setManageState({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to replace asset.',
        success: null,
      });
    }
  }

  async function replaceTraitWithDataUrl(dataUrl: string, assetRelativePath: string, fileName: string) {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });
    await replaceTraitWithFile(file, assetRelativePath);
  }

  async function createTraitFromDataUrl(dataUrl: string, layerName: string, traitName: string, preferredOrder?: number) {
    const rootDir = rootDirInput.trim();
    if (!rootDir || !layerName.trim()) {
      setManageState({ loading: false, error: 'Choose a target layer before creating a pasted trait.', success: null });
      return;
    }

    setManageState({ loading: true, error: null, success: null });

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = buildNewTraitFileName(traitName);
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });
      const formData = new FormData();
      formData.append('rootDir', rootDir);
      formData.append('layerName', layerName.trim());
      if (preferredOrder && Number.isFinite(preferredOrder)) {
        formData.append('layerOrder', String(preferredOrder));
      }
      formData.append('file', file);

      const response = await fetch('/api/art-generator/upload', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as
        | {
            upload: { layerDirectoryName: string; fileName: string; relativePath: string };
            library: TraitLibrary;
          }
        | { error: string };

      if (!response.ok || 'error' in payload) {
        throw new Error('error' in payload ? payload.error : 'Failed to create trait from pasted image.');
      }

      applyLibrary(payload.library, selectedTraits, payload.upload.relativePath);
      setReplaceTargetAssetPath(payload.upload.relativePath);
      setPendingNewTrait(null);
      setManageState({ loading: false, error: null, success: `Created new trait “${payload.upload.fileName}”.` });
      setPastedImages((current) => current.filter((image) => image.dataUrl !== dataUrl));
      setLastPastedImageId((current) => (lastPastedImage?.dataUrl === dataUrl ? null : current));
    } catch (error) {
      setManageState({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to create trait from pasted image.',
        success: null,
      });
    }
  }

  function startNewPastedTrait(layerName: string, preferredTraitName?: string, autoCreateOnPaste = false) {
    const draft = normalizePendingNewTrait({ layerName, traitName: preferredTraitName }, uploadLayerName || 'background');
    setPendingNewTrait({ ...draft, autoCreateOnPaste });
    setManageState({
      loading: false,
      error: null,
      success: autoCreateOnPaste
        ? `Auto-create armed. Next Ctrl+V will immediately create “${draft.traitName}” in ${draft.layerName}.`
        : `Paste an image now to create “${draft.traitName}” in ${draft.layerName}. Pasting again can overwrite it once created.`,
    });
  }

  async function loadDefaultRoot() {
    setState({ loading: true, error: null });
    try {
      await loadCanonicalRoot();
    } catch (error) {
      setLibrary(null);
      previousLibraryRef.current = null;
      setLayerOrder([]);
      setSelectedTraits({});
      setState({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load canonical root.',
      });
    }
  }

  async function loadLibrary() {
    try {
      await loadCanonicalRoot();
    } catch (error) {
      setLibrary(null);
      previousLibraryRef.current = null;
      setLayerOrder([]);
      setSelectedTraits({});
      setState({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load trait assets.',
      });
    }
  }

  const lastPastedImage = pastedImages.find((image) => image.id === lastPastedImageId) ?? pastedImages[0] ?? null;
  const pendingTraitDraft = normalizePendingNewTrait(pendingNewTrait, uploadLayerName || 'background');
  const totalTraitCount = library?.layers.reduce((sum, layer) => sum + layer.traits.length, 0) ?? 0;

  const selectedRootLabel = library?.rootDir || rootDirInput || 'No root selected';
  const forgeStatusLabel = library ? 'Forge armed' : 'Awaiting root';

  const autosaveLabel =
    autosaveStatus === 'saving' ? 'Autosaving…'
      : autosaveStatus === 'saved' ? 'Autosaved'
      : autosaveStatus === 'error' ? 'Autosave failed'
      : hydratedRef.current ? 'Idle' : 'Loading…';

  return (
    <main className="studio-shell">
      <header className="studio-toolbar">
        <div className="toolbar-brand">
          <h1 className="toolbar-title">neochibi studio trait forge</h1>
          <span className="toolbar-root" title={selectedRootLabel}>{selectedRootLabel}</span>
        </div>
        <div className="toolbar-stats">
          <span className="hero-chip hero-chip-acid">{forgeStatusLabel}</span>
          <span className="hero-chip">{library?.layers.length ?? 0} layers</span>
          <span className="hero-chip">{totalTraitCount} traits</span>
          <span className={`hero-chip autosave-chip autosave-${autosaveStatus}`}>{autosaveLabel}</span>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button small-button" onClick={randomizeSelection} type="button" disabled={!library}>
            Shuffle
          </button>
          <button className="secondary-button small-button" onClick={loadLibrary} type="button" disabled={state.loading}>
            {state.loading ? 'Loading…' : 'Reload'}
          </button>
        </div>
      </header>

      {state.error ? <p className="error-banner">{state.error}</p> : null}

      <datalist id="layer-name-options">
        {layerNameSuggestions.map((layerName) => (
          <option key={layerName} value={layerName} />
        ))}
      </datalist>

      <section className="studio-grid studio-grid-compact">
        <aside className="panel panel-layers">
          <div className="panel-header panel-header-tight">
            <h2>Layers</h2>
          </div>

          {orderedLayers.length === 0 ? (
            <p className="empty-state">Load a root directory to populate layers.</p>
          ) : (
            <div className="layer-list">
              {orderedLayers.map((layer, index) => {
                const selected = selectedTraits[layer.id] ?? '';
                const selectedTrait = layer.traits.find((trait) => trait.id === selected) ?? null;
                const armed = pendingNewTrait?.layerName?.toLowerCase() === layer.name.toLowerCase();
                const replaceArmed = !!selectedTrait && pendingReplaceTarget?.relativePath === selectedTrait.relativePath;
                return (
                  <article className={`layer-card layer-card-compact${armed ? ' layer-card-armed' : ''}${replaceArmed ? ' layer-card-armed-replace' : ''}`} key={layer.id}>
                    <div className="layer-card-compact-body">
                      <div className="layer-reorder-stack">
                        <button
                          className="icon-button"
                          type="button"
                          disabled={index === 0}
                          aria-label={`Move ${layer.name} up`}
                          onClick={() => reorderLayer(index, -1)}
                        >
                          ↑
                        </button>
                        <span className="layer-index-mini">#{index + 1}</span>
                        <button
                          className="icon-button"
                          type="button"
                          disabled={index === orderedLayers.length - 1}
                          aria-label={`Move ${layer.name} down`}
                          onClick={() => reorderLayer(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                      <div className="layer-trait-thumb">
                        {selectedTrait && library ? (
                          <img alt={`${layer.name}: ${selectedTrait.name}`} src={buildAssetUrl(library.rootDir, selectedTrait)} />
                        ) : (
                          <span className="layer-trait-thumb-empty">—</span>
                        )}
                      </div>
                      <div className="layer-card-compact-main">
                        <div className="layer-card-compact-head">
                          <h3>{layer.name}</h3>
                          <span className="layer-meta">{layer.traits.length} traits</span>
                        </div>
                        <div className="layer-card-compact-row">
                          {library ? (
                            <TraitPicker
                              layer={layer}
                              library={library}
                              value={selected}
                              onChange={(traitId) => selectTrait(layer.id, traitId)}
                              buildAssetUrl={buildAssetUrl}
                            />
                          ) : null}
                          <button
                            className={`secondary-button small-button${armed ? ' active-reference-chip' : ''}`}
                            type="button"
                            onClick={() => {
                              if (armed) {
                                setPendingNewTrait(null);
                                return;
                              }
                              setPendingReplaceTarget(null);
                              startNewPastedTrait(layer.name, `${layer.name}-trait`, true);
                            }}
                          >
                            {armed ? 'Paste armed…' : 'Paste new'}
                          </button>
                          <button
                            className="secondary-button small-button"
                            type="button"
                            disabled={layer.traits.length === 0}
                            onClick={() => randomizeLayer(layer)}
                            title="Pick a random trait from this layer (respects rarity weights)"
                          >
                            Random
                          </button>
                        </div>
                        {selectedTrait ? (
                          <div className="layer-card-compact-row">
                            <input
                              className="layer-trait-select"
                              value={renameTraitDrafts[selectedTrait.relativePath] ?? selectedTrait.name}
                              onChange={(event) => setRenameTraitDrafts((current) => ({ ...current, [selectedTrait.relativePath]: event.target.value }))}
                              placeholder="Trait name"
                              type="text"
                            />
                            <button
                              className="secondary-button small-button"
                              type="button"
                              disabled={manageState.loading}
                              onClick={() => void renameTrait(selectedTrait)}
                            >
                              Rename
                            </button>
                            <button
                              className={`secondary-button small-button${replaceArmed ? ' active-reference-chip' : ''}`}
                              type="button"
                              disabled={manageState.loading}
                              onClick={() => {
                                if (replaceArmed) {
                                  setPendingReplaceTarget(null);
                                  return;
                                }
                                setPendingNewTrait(null);
                                setPendingReplaceTarget({
                                  relativePath: selectedTrait.relativePath,
                                  layerName: layer.name,
                                  traitName: selectedTrait.name,
                                });
                                setManageState({ loading: false, error: null, success: `Paste to replace “${layer.name} / ${selectedTrait.name}”. Cmd+V an image.` });
                              }}
                              title="Arm: next pasted image overwrites this trait's bytes in place"
                            >
                              {replaceArmed ? 'Replace armed…' : 'Replace'}
                            </button>
                            <button
                              className="secondary-button small-button danger-button"
                              type="button"
                              disabled={manageState.loading}
                              onClick={() => void deleteTrait(selectedTrait)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>

        <PreviewCanvas
          library={library}
          previewLayers={previewLayers}
          effects={effects}
          onEffectsChange={setEffects}
          exportName={exportName}
          onExportNameChange={setExportName}
          buildAssetUrl={buildAssetUrl}
        />
      </section>


      {activeTab === 'library' ? (
      <section className="panel manager-panel tab-panel">
        <div className="panel-header compact-panel-header">
          <h2>Layer + trait management</h2>
          <p>Create layers, persist reordered folders, rename selected traits, delete assets, create new pasted traits, and replace a target image by file upload or Ctrl+V paste.</p>
        </div>

        <div className="manager-grid">
          <label className="field-group">
            <span>New layer name</span>
            <input value={newLayerName} onChange={(event) => setNewLayerName(event.target.value)} placeholder="Headwear" type="text" />
          </label>
          <label className="field-group">
            <span>Layer order (optional)</span>
            <input value={newLayerOrder} onChange={(event) => setNewLayerOrder(event.target.value)} inputMode="numeric" min="1" type="number" placeholder="Auto" />
          </label>
          <button className="primary-button" type="button" onClick={createLayer} disabled={manageState.loading}>
            Create layer
          </button>
          <button className="secondary-button" type="button" onClick={persistLayerOrder} disabled={!library || manageState.loading}>
            Persist layer order
          </button>
        </div>

        {orderedLayers.length > 0 ? (
          <div className="layer-manager-list">
            <h3>Existing layers ({orderedLayers.length})</h3>
            {orderedLayers.map((layer) => (
              <div className="layer-manager-row" key={layer.directoryName}>
                <div className="layer-manager-meta">
                  <strong>{layer.name}</strong>
                  <span className="preset-meta">{layer.traits.length} trait{layer.traits.length === 1 ? '' : 's'} · {layer.directoryName}/</span>
                </div>
                <input
                  type="text"
                  value={renameLayerDrafts[layer.directoryName] ?? layer.name}
                  onChange={(event) => setRenameLayerDrafts((current) => ({ ...current, [layer.directoryName]: event.target.value }))}
                  placeholder="New layer name"
                />
                <button
                  className="secondary-button small-button"
                  type="button"
                  disabled={manageState.loading || !(renameLayerDrafts[layer.directoryName] || '').trim() || (renameLayerDrafts[layer.directoryName] || '').trim() === layer.name}
                  onClick={() => void renameLayer(layer)}
                >
                  Rename
                </button>
                <button
                  className="secondary-button small-button danger-button"
                  type="button"
                  disabled={manageState.loading}
                  onClick={() => void deleteLayer(layer)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {orderedLayers.length > 0 ? (
          <div className="weights-manager">
            <h3>Trait rarities</h3>
            <p className="preset-meta">Weights are relative within a layer. Default 1. Higher = more common. 0 = never roll. Stored in <code>{'<root>/.studio-weights.json'}</code>.</p>
            {orderedLayers.map((layer) => (
              <details className="weights-layer" key={layer.id}>
                <summary>
                  <strong>{layer.name}</strong>
                  <span className="preset-meta">{layer.traits.length} trait{layer.traits.length === 1 ? '' : 's'}</span>
                </summary>
                {layer.traits.length === 0 ? (
                  <p className="empty-state">No traits in this layer yet.</p>
                ) : (
                  <ul className="weights-trait-list">
                    {layer.traits.map((trait) => {
                      const weight = traitWeights[trait.relativePath] ?? DEFAULT_TRAIT_WEIGHT;
                      return (
                        <li className="weights-trait-row" key={trait.relativePath}>
                          <img alt={trait.name} className="weights-trait-thumb" src={buildAssetUrl(library!.rootDir, trait)} />
                          <span className="weights-trait-name">{trait.name}</span>
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            step={1}
                            value={weight}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              setTraitWeights((current) => ({
                                ...current,
                                [trait.relativePath]: Number.isFinite(next) && next >= 0 ? next : 0,
                              }));
                            }}
                          />
                          <div className="weights-chip-row">
                            {([
                              ['Common', 10],
                              ['Uncommon', 5],
                              ['Rare', 2],
                              ['Legendary', 1],
                              ['None', 0],
                            ] as const).map(([label, value]) => (
                              <button
                                key={label}
                                type="button"
                                className={`weights-chip${weight === value ? ' weights-chip-active' : ''}`}
                                onClick={() => setTraitWeights((current) => ({ ...current, [trait.relativePath]: value }))}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </details>
            ))}
          </div>
        ) : null}

        <div className="replace-grid">
          <label className="field-group">
            <span>Replacement target</span>
            <select value={replaceTargetAssetPath} onChange={(event) => setReplaceTargetAssetPath(event.target.value)}>
              <option value="">Select trait asset</option>
              {library?.layers.flatMap((layer) => layer.traits.map((trait) => (
                <option key={trait.relativePath} value={trait.relativePath}>{layer.name} / {trait.name}</option>
              )))}
            </select>
          </label>
          <label className="field-group">
            <span>Replacement file</span>
            <input ref={replaceFileInputRef} type="file" accept=".png,.webp,.jpg,.jpeg,.gif,.svg" />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={!replaceTargetAssetPath || manageState.loading}
            onClick={() => {
              const file = replaceFileInputRef.current?.files?.[0];
              if (file) {
                void replaceTraitWithFile(file, replaceTargetAssetPath);
              }
            }}
          >
            Replace from file
          </button>
        </div>

        <div className="replace-grid paste-create-grid">
          <label className="field-group">
            <span>New pasted trait layer</span>
            <input
              list="layer-name-options"
              value={pendingNewTrait?.layerName ?? ''}
              onChange={(event) => setPendingNewTrait((current) => ({
                ...normalizePendingNewTrait({ layerName: event.target.value, traitName: current?.traitName }, uploadLayerName || 'background'),
                autoCreateOnPaste: current?.autoCreateOnPaste ?? false,
              }))}
              placeholder="Body, Eyes, Hat…"
              type="text"
            />
          </label>
          <label className="field-group">
            <span>New pasted trait name</span>
            <input
              value={pendingNewTrait?.traitName ?? ''}
              onChange={(event) => setPendingNewTrait((current) => ({
                ...normalizePendingNewTrait({ layerName: current?.layerName, traitName: event.target.value }, uploadLayerName || 'background'),
                autoCreateOnPaste: current?.autoCreateOnPaste ?? false,
              }))}
              placeholder="Sleepy Half-Lids Variant"
              type="text"
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={manageState.loading || !(pendingTraitDraft.layerName.trim())}
            onClick={() => startNewPastedTrait(pendingTraitDraft.layerName, pendingTraitDraft.traitName)}
          >
            Arm paste-create
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={manageState.loading || !(pendingTraitDraft.layerName.trim())}
            onClick={() => startNewPastedTrait(pendingTraitDraft.layerName, pendingTraitDraft.traitName, true)}
          >
            Auto-create on paste
          </button>
        </div>

        {lastPastedImage ? (
          <div className="reference-block sticky-paste-block">
            <h3>Last pasted image</h3>
            <div className="sticky-paste-row">
              <img alt={lastPastedImage.name} className="sticky-paste-image" src={lastPastedImage.dataUrl} />
              <div className="pasted-image-actions">
                <strong>{lastPastedImage.name}</strong>
                <span className="preset-meta">Quick actions for the most recent paste.</span>
                <div className="preset-actions">
                  <button
                    className="secondary-button small-button"
                    type="button"
                    disabled={!replaceTargetAssetPath || manageState.loading}
                    onClick={() => void replaceTraitWithDataUrl(lastPastedImage.dataUrl, replaceTargetAssetPath, lastPastedImage.name)}
                  >
                    Paste over selected trait
                  </button>
                  <button
                    className="secondary-button small-button"
                    type="button"
                    disabled={manageState.loading}
                    onClick={() => void createTraitFromDataUrl(lastPastedImage.dataUrl, pendingTraitDraft.layerName, pendingTraitDraft.traitName)}
                  >
                    Create from last paste
                  </button>
                  <button
                    className="secondary-button small-button danger-button"
                    type="button"
                    onClick={() => {
                      setPastedImages((current) => current.filter((image) => image.id !== lastPastedImage.id));
                      setLastPastedImageId(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {pendingNewTrait ? (
          <div className="reference-block pending-paste-block">
            <h3>{pendingNewTrait.autoCreateOnPaste ? 'Auto-create armed' : 'Paste-create armed'}</h3>
            <p className="preset-meta">
              {pendingNewTrait.autoCreateOnPaste
                ? `Next Ctrl+V image will immediately create “${pendingTraitDraft.traitName}” in ${pendingTraitDraft.layerName}.`
                : `Next Ctrl+V image will create “${pendingTraitDraft.traitName}” in ${pendingTraitDraft.layerName}. Then you can paste again to overwrite that created trait.`}
            </p>
            <div className="preset-actions">
              <button className="secondary-button small-button" type="button" onClick={() => setPendingNewTrait(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {manageState.error ? <p className="error-banner">{manageState.error}</p> : null}
        {manageState.success ? <p className="success-banner">{manageState.success}</p> : null}
      </section>
      ) : null}

      {activeTab === 'templates' ? (
      <section className="panel tab-panel">
        <div className="panel-header compact-panel-header">
          <h2>Collection templates</h2>
          <p>Two templates: {TEMPLATE_LABELS.templateA} and {TEMPLATE_LABELS.templateB}. Mark layers as Always (must include), Never (skipped), or Optional. The Collection preview gallery rolls each tile against a template picked by the distribution below.</p>
        </div>

        <div className="template-distribution">
          <label className="field-group">
            <span>{TEMPLATE_LABELS.templateA} weight ({templates.templateAWeight}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={templates.templateAWeight}
              onChange={(event) => updateTemplateAWeight(Number(event.target.value))}
            />
          </label>
          <div className="template-distribution-readout">
            <span><strong>{templates.templateAWeight}%</strong> {TEMPLATE_LABELS.templateA}</span>
            <span><strong>{100 - templates.templateAWeight}%</strong> {TEMPLATE_LABELS.templateB}</span>
          </div>
        </div>

        {orderedLayers.length === 0 ? (
          <p className="empty-state">Load a root directory to configure templates.</p>
        ) : (
          <div className="template-grid">
            {(['templateA', 'templateB'] as TemplateKind[]).map((kind) => (
              <div className="template-card" key={kind}>
                <h3>{TEMPLATE_LABELS[kind]}</h3>
                <ul className="template-layer-list">
                  {orderedLayers.map((layer) => {
                    const state = getLayerTemplateState(templates[kind], layer.id);
                    const layerRule = getTemplateLayerRule(templates[kind], layer.id);
                    const chancePercent = state === 'always' ? 100 : state === 'never' ? 0 : layerRule.chancePercent;
                    const skipCount = layerRule.excludeLayerIds.length;
                    const excludedSet = new Set(templates[kind].excludedTraitPaths);
                    const includedCount = layer.traits.filter((t) => !excludedSet.has(t.relativePath)).length;
                    const allIncluded = layer.traits.length > 0 && includedCount === layer.traits.length;
                    return (
                      <li className="template-layer-row" key={layer.id}>
                        <div className="template-layer-row-head">
                          <div className="template-layer-name">
                            <strong>{layer.name}</strong>
                            <span className="preset-meta">
                              {includedCount}/{layer.traits.length} trait{layer.traits.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="template-toggle" role="group" aria-label={`${TEMPLATE_LABELS[kind]} ${layer.name} state`}>
                            {(['always', 'optional', 'never'] as const).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                className={`template-toggle-button template-toggle-${opt}${state === opt ? ' template-toggle-active' : ''}`}
                                onClick={() => updateTemplateLayerState(kind, layer.id, opt)}
                              >
                                {opt === 'always' ? 'Always' : opt === 'never' ? 'Never' : 'Optional'}
                              </button>
                            ))}
                          </div>
                        </div>
                        {state !== 'never' ? (
                          <div className="template-layer-rule-strip">
                            <label className="template-layer-chance">
                              <span>Appears</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={chancePercent}
                                disabled={state !== 'optional'}
                                onChange={(event) => {
                                  const next = Number(event.target.value);
                                  updateTemplateLayerChance(kind, layer.id, Number.isFinite(next) ? next : 0);
                                }}
                              />
                              <span>%</span>
                            </label>
                            {state === 'optional' ? (
                              <input
                                aria-label={`${TEMPLATE_LABELS[kind]} ${layer.name} appearance chance`}
                                className="template-layer-chance-range"
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={chancePercent}
                                onChange={(event) => updateTemplateLayerChance(kind, layer.id, Number(event.target.value))}
                              />
                            ) : (
                              <span className="preset-meta">Always uses 100%</span>
                            )}
                          </div>
                        ) : null}
                        {state !== 'never' ? (
                          <details className="template-layer-conditional">
                            <summary>
                              <span>Skips when present</span>
                              <span className="preset-meta">
                                {skipCount === 0 ? 'none' : `${skipCount} layer${skipCount === 1 ? '' : 's'}`}
                              </span>
                            </summary>
                            <div className="layer-exclusion-targets template-layer-skip-targets">
                              {orderedLayers
                                .filter((targetLayer) => targetLayer.id !== layer.id)
                                .map((targetLayer) => {
                                  const checked = layerRule.excludeLayerIds.includes(targetLayer.id);
                                  return (
                                    <label
                                      key={targetLayer.id}
                                      className={`layer-exclusion-pill${checked ? ' layer-exclusion-pill-active' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => {
                                          const next = new Set(layerRule.excludeLayerIds);
                                          if (event.target.checked) next.add(targetLayer.id);
                                          else next.delete(targetLayer.id);
                                          updateTemplateLayerSkips(kind, layer.id, Array.from(next));
                                        }}
                                      />
                                      <span>skip {targetLayer.name}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </details>
                        ) : null}
                        {layer.traits.length > 0 && state !== 'never' ? (
                          <details className="template-trait-subset">
                            <summary>
                              <span>Trait subset</span>
                              <span className="preset-meta">
                                {includedCount === layer.traits.length
                                  ? 'all included'
                                  : `${includedCount} included, ${layer.traits.length - includedCount} excluded`}
                              </span>
                            </summary>
                            <div className="template-trait-subset-actions">
                              <button
                                type="button"
                                className="secondary-button small-button"
                                disabled={allIncluded}
                                onClick={() => setLayerTraitsInTemplate(kind, layer, true)}
                              >
                                Include all
                              </button>
                              <button
                                type="button"
                                className="secondary-button small-button"
                                disabled={includedCount === 0}
                                onClick={() => setLayerTraitsInTemplate(kind, layer, false)}
                              >
                                Exclude all
                              </button>
                            </div>
                            <ul className="template-trait-subset-list">
                              {layer.traits.map((trait) => {
                                const excluded = excludedSet.has(trait.relativePath);
                                return (
                                  <li className="template-trait-subset-item" key={trait.relativePath}>
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={!excluded}
                                        onChange={(event) => toggleTraitInTemplate(kind, trait.relativePath, event.target.checked)}
                                      />
                                      {library ? (
                                        <img alt={trait.name} className="template-trait-subset-thumb" src={buildAssetUrl(library.rootDir, trait)} />
                                      ) : null}
                                      <span>{trait.name}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {orderedLayers.length > 0 ? (
          <div className="rules-card">
            <div className="panel-header compact-panel-header">
              <h3>Trait pairs</h3>
              <p>Bidirectional. When trait A is rolled, force trait B's layer to B. Useful for matching tail/hair colorways.</p>
            </div>
            <div className="trait-pair-add">
              <select value={pairDraftA} onChange={(event) => setPairDraftA(event.target.value)}>
                <option value="">— pick trait A —</option>
                {orderedLayers.map((layer) => (
                  <optgroup key={layer.id} label={layer.name}>
                    {layer.traits.map((trait) => (
                      <option key={trait.relativePath} value={trait.relativePath}>{trait.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="pair-arrow">↔</span>
              <select value={pairDraftB} onChange={(event) => setPairDraftB(event.target.value)}>
                <option value="">— pick trait B —</option>
                {orderedLayers.map((layer) => (
                  <optgroup key={layer.id} label={layer.name}>
                    {layer.traits.map((trait) => (
                      <option key={trait.relativePath} value={trait.relativePath}>{trait.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                className="primary-button small-button"
                disabled={!pairDraftA || !pairDraftB || pairDraftA === pairDraftB}
                onClick={() => {
                  addTraitPair(pairDraftA, pairDraftB);
                  setPairDraftA('');
                  setPairDraftB('');
                }}
              >
                Add pair
              </button>
            </div>
            {templates.traitPairs.length === 0 ? (
              <p className="empty-state">No pairs yet.</p>
            ) : (
              <ul className="trait-pair-list">
                {templates.traitPairs.map((pair, index) => {
                  const aLayer = orderedLayers.find((layer) => layer.traits.some((t) => t.relativePath === pair.a));
                  const aTrait = aLayer?.traits.find((t) => t.relativePath === pair.a) ?? null;
                  const bLayer = orderedLayers.find((layer) => layer.traits.some((t) => t.relativePath === pair.b));
                  const bTrait = bLayer?.traits.find((t) => t.relativePath === pair.b) ?? null;
                  return (
                    <li className="trait-pair-row" key={`${pair.a}|${pair.b}`}>
                      <div className="trait-pair-side">
                        {library && aTrait ? <img alt={aTrait.name} src={buildAssetUrl(library.rootDir, aTrait)} className="trait-pair-thumb" /> : null}
                        <div>
                          <strong>{aTrait?.name ?? pair.a}</strong>
                          <span className="preset-meta">{aLayer?.name ?? '?'}</span>
                        </div>
                      </div>
                      <span className="pair-arrow">↔</span>
                      <div className="trait-pair-side">
                        {library && bTrait ? <img alt={bTrait.name} src={buildAssetUrl(library.rootDir, bTrait)} className="trait-pair-thumb" /> : null}
                        <div>
                          <strong>{bTrait?.name ?? pair.b}</strong>
                          <span className="preset-meta">{bLayer?.name ?? '?'}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="secondary-button small-button danger-button"
                        onClick={() => removeTraitPair(index)}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {orderedLayers.length > 0 ? (
          <div className="rules-card">
            <div className="panel-header compact-panel-header">
              <h3>Global layer exclusions</h3>
              <p>Applies to both templates. Use the per-layer template controls above when a skip should only affect {TEMPLATE_LABELS.templateA} or {TEMPLATE_LABELS.templateB}.</p>
            </div>
            <div className="layer-exclusion-add">
              <label className="field-group">
                <span>Source layer</span>
                <select value={exclusionDraftSource} onChange={(event) => setExclusionDraftSource(event.target.value)}>
                  <option value="">— pick a layer —</option>
                  {orderedLayers
                    .filter((layer) => !templates.layerExclusions.some((rule) => rule.sourceLayerId === layer.id))
                    .map((layer) => (
                      <option key={layer.id} value={layer.id}>{layer.name}</option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="primary-button small-button"
                disabled={!exclusionDraftSource}
                onClick={() => {
                  addLayerExclusion(exclusionDraftSource);
                  setExclusionDraftSource('');
                }}
              >
                Add rule
              </button>
            </div>
            {templates.layerExclusions.length === 0 ? (
              <p className="empty-state">No exclusion rules yet.</p>
            ) : (
              <ul className="layer-exclusion-list">
                {templates.layerExclusions.map((rule) => {
                  const sourceLayer = orderedLayers.find((layer) => layer.id === rule.sourceLayerId);
                  const excludedSet = new Set(rule.excludeLayerIds);
                  return (
                    <li className="layer-exclusion-row" key={rule.sourceLayerId}>
                      <div className="layer-exclusion-head">
                        <strong>When {sourceLayer?.name ?? rule.sourceLayerId} rolls →</strong>
                        <button
                          type="button"
                          className="secondary-button small-button danger-button"
                          onClick={() => removeLayerExclusion(rule.sourceLayerId)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="layer-exclusion-targets">
                        {orderedLayers
                          .filter((layer) => layer.id !== rule.sourceLayerId)
                          .map((layer) => {
                            const checked = excludedSet.has(layer.id);
                            return (
                              <label key={layer.id} className={`layer-exclusion-pill${checked ? ' layer-exclusion-pill-active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    const next = new Set(rule.excludeLayerIds);
                                    if (event.target.checked) next.add(layer.id);
                                    else next.delete(layer.id);
                                    setLayerExclusion(rule.sourceLayerId, Array.from(next));
                                  }}
                                />
                                <span>skip {layer.name}</span>
                              </label>
                            );
                          })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div className="stats-card">
          <div className="stats-card-head">
            <h3>Collection stats</h3>
            <p className="preset-meta">Capacity is the deterministic upper bound (product of viable traits per non-Never layer). Simulation runs the actual weighted roll to estimate how many uniques you'll get under your rarity setup.</p>
          </div>
          <div className="stats-controls">
            <label className="field-group">
              <span>Target collection size</span>
              <input
                type="number"
                min={1}
                max={1000000}
                step={1}
                value={targetCollectionSize}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setTargetCollectionSize(Number.isFinite(next) && next > 0 ? Math.floor(next) : 10000);
                }}
              />
            </label>
            <button
              className="primary-button"
              type="button"
              disabled={simulationRunning || orderedLayers.length === 0}
              onClick={runSimulation}
            >
              {simulationRunning ? 'Simulating…' : 'Simulate'}
            </button>
          </div>

          <div className="stats-grid">
            <div className={`stats-readout${capacities.total < targetCollectionSize ? ' stats-readout-warn' : ''}`}>
              <span className="stats-label">Capacity</span>
              <strong>{capacities.total.toLocaleString()}</strong>
              <span className="preset-meta">
                {TEMPLATE_LABELS.templateA} {capacities.templateA.toLocaleString()} · {TEMPLATE_LABELS.templateB} {capacities.templateB.toLocaleString()}
              </span>
              {capacities.total < targetCollectionSize ? (
                <span className="stats-warn-text">Below target ({targetCollectionSize.toLocaleString()}). Add traits or remove Never layers.</span>
              ) : null}
            </div>
            {simulationResult ? (
              <div className={`stats-readout${simulationResult.uniqueCount < simulationResult.targetSize ? ' stats-readout-warn' : ''}`}>
                <span className="stats-label">Simulated unique</span>
                <strong>{simulationResult.uniqueCount.toLocaleString()} / {simulationResult.targetSize.toLocaleString()}</strong>
                <span className="preset-meta">
                  {simulationResult.totalAttempts.toLocaleString()} attempts · {TEMPLATE_LABELS.templateA} {simulationResult.templateCounts.templateA.toLocaleString()} · {TEMPLATE_LABELS.templateB} {simulationResult.templateCounts.templateB.toLocaleString()}
                </span>
                {simulationResult.missingAlwaysEvents > 0 ? (
                  <span className="stats-warn-text">{simulationResult.missingAlwaysEvents.toLocaleString()} rolls missed an Always layer (no viable trait).</span>
                ) : null}
                {simulationResult.uniqueCount < simulationResult.targetSize ? (
                  <span className="stats-warn-text">Couldn't hit target before attempt cap. Either capacity is too low or weights are too skewed.</span>
                ) : null}
              </div>
            ) : null}
          </div>

          {simulationResult ? (
            <div className="stats-trait-list">
              <h4>Per-trait counts</h4>
              {orderedLayers.map((layer) => {
                const layerStats = simulationResult.traitStats.filter((stat) => stat.layerId === layer.id);
                if (layerStats.length === 0) return null;
                const sorted = [...layerStats].sort((a, b) => b.count - a.count);
                return (
                  <details className="stats-layer-block" key={layer.id}>
                    <summary>
                      <strong>{layer.name}</strong>
                      <span className="preset-meta">{sorted.length} trait{sorted.length === 1 ? '' : 's'}</span>
                    </summary>
                    <table className="stats-trait-table">
                      <thead>
                        <tr>
                          <th>Trait</th>
                          <th>Weight</th>
                          <th>Rolled</th>
                          <th>% of mints</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((stat) => (
                          <tr key={stat.relativePath} className={stat.count === 0 ? 'stats-trait-row-empty' : ''}>
                            <td>{stat.traitName}</td>
                            <td>{stat.weight}</td>
                            <td>{stat.count.toLocaleString()}</td>
                            <td>{simulationResult.uniqueCount > 0 ? ((stat.count / simulationResult.uniqueCount) * 100).toFixed(1) : '0.0'}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      <section className="panel collection-preview-panel">
          <div className="panel-header compact-panel-header">
            <h2>Collection preview ({gallerySeeds.length})</h2>
            <p>Pure-random rolls across the active layers. Each tile gets a random effect preset (uniform). Toggle Effects to compare with the raw composite.</p>
          </div>
          <div className="gallery-toolbar">
            <label className="field-group">
              <span>Tile count</span>
              <select
                value={galleryTileCount}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setGalleryTileCount(next);
                  rerollGallery(next);
                }}
              >
                {[8, 16, 32, 64, 128, 256, 512].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="field-group">
              <span>Tile size</span>
              <select value={galleryTileSize} onChange={(event) => setGalleryTileSize(event.target.value as GalleryTileSize)}>
                <option value="s">Small</option>
                <option value="m">Medium</option>
                <option value="l">Large</option>
                <option value="xl">XL</option>
              </select>
            </label>
            <button
              className={`secondary-button${galleryEffectsEnabled ? ' active-reference-chip' : ''}`}
              type="button"
              onClick={() => setGalleryEffectsEnabled((current) => !current)}
              title="Toggle the random per-NFT effect preset on the collection preview"
            >
              {galleryEffectsEnabled ? 'Effects on' : 'Effects off'}
            </button>
            <button className="primary-button" type="button" onClick={() => rerollGallery()} disabled={!library}>
              Reroll
            </button>
          </div>
          {!library ? (
            <p className="empty-state">Load a root directory to preview a randomized collection.</p>
          ) : gallerySeeds.length === 0 ? (
            <p className="empty-state">Click Reroll to generate {galleryTileCount} random combinations.</p>
          ) : (
            <div className={`gallery-grid gallery-grid-${galleryTileSize}`}>
              {gallerySeeds.map((seed, index) => {
                const tileEffects = galleryEffectsEnabled && seed.presetId
                  ? tileScaledPresetEffects[seed.presetId] ?? NO_EFFECTS
                  : NO_EFFECTS;
                const presetLabel = seed.presetId
                  ? PREVIEW_EFFECT_PRESETS.find((p) => p.id === seed.presetId)?.label ?? null
                  : null;
                return (
                  <button
                    className={`gallery-tile gallery-tile-button${activeGalleryTileIndex === index ? ' gallery-tile-active' : ''}`}
                    key={index}
                    type="button"
                    onClick={() => loadGalleryTileSelection(seed, index)}
                    aria-label={`Load NFT ${index + 1} traits into preview`}
                    aria-pressed={activeGalleryTileIndex === index}
                  >
                    <GalleryTile
                      library={library}
                      orderedLayers={orderedLayers}
                      selection={seed.selection}
                      effects={tileEffects}
                      buildAssetUrl={buildAssetUrl}
                      size={galleryCanvasSize}
                    />
                    <span className="gallery-tile-index">#{index + 1}</span>
                    <span className={`gallery-tile-template-badge gallery-tile-template-${seed.kind}`}>{TEMPLATE_LABELS[seed.kind]}</span>
                    {galleryEffectsEnabled && presetLabel ? (
                      <span className="gallery-tile-preset-badge">{presetLabel}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

      <nav className="studio-tabs">
        {([
          { id: 'library', label: 'Library manager', count: null },
          { id: 'templates', label: 'Templates', count: null },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`studio-tab${isActive ? ' studio-tab-active' : ''}`}
              onClick={() => setActiveTab((current) => (current === tab.id ? null : tab.id))}
            >
              {tab.label}
              {tab.count !== null && tab.count > 0 ? <span className="studio-tab-count">{tab.count}</span> : null}
            </button>
          );
        })}
      </nav>

    </main>
  );
}

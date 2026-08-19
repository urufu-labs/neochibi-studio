'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildNewTraitFileName, normalizePendingNewTrait } from '@/lib/art-generator/paste-traits';
import { createSavedConfig, hydrateSavedConfig, type StoredGeneratorConfigFile } from '@/lib/art-generator/presets';
import {
  DEFAULT_RULES,
  getTemplateLayerRule,
  getLayerTemplateState,
  pickWeightedTrait,
  rollFromTemplate,
  setLayerTemplateState,
  setTemplateLayerRule,
  simulateCollection,
  templateCapacity,
  type CollectionRules,
  type SimulationResult,
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
import { getAssetStore, useAssetStoreVersion } from '@/lib/storage/asset-store';
import { PreviewCanvas } from '@/components/preview-canvas';
import { GalleryTile } from '@/components/gallery-tile';
import { TraitPicker } from '@/components/trait-picker';
import { UploadDropzone } from '@/components/upload-dropzone';
import { CollectionGenerator } from '@/components/collection-generator';
import { CollectionBrowser } from '@/components/collection-browser';
import { IpfsPushPanel } from '@/components/ipfs-push-panel';
import { DownloadPanel } from '@/components/download-panel';
import { StudioSteps } from '@/components/studio-steps';

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
  return getAssetStore().buildAssetUrl(rootDir, asset);
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
  const [projectName, setProjectName] = useState<string>('Untitled Collection');
  const [renamingProject, setRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState<string>('');
  const [outputCount, setOutputCount] = useState(0);
  const storeVersion = useAssetStoreVersion();
  const [library, setLibrary] = useState<TraitLibrary | null>(null);
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [selectedTraits, setSelectedTraits] = useState<Record<string, string>>({});
  const selectedTraitsRef = useRef(selectedTraits);
  selectedTraitsRef.current = selectedTraits;
  const [state, setState] = useState<LoadableState>({ loading: false, error: null });

  const [uploadLayerName, setUploadLayerName] = useState('');

  const [exportName, setExportName] = useState('');
  const [effects, setEffects] = useState<PreviewEffect[]>(() => [...DEFAULT_PREVIEW_EFFECTS]);

  const [rules, setRules] = useState<CollectionRules>(() => ({
    template: { ...DEFAULT_RULES.template, excludedTraitPaths: [], layerRules: [] },
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
  interface PendingDelete {
    kind: 'layer' | 'trait';
    label: string;
    impactSummary: string[];
    confirm: () => Promise<void>;
  }
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const [pairDraftA, setPairDraftA] = useState('');
  const [pairDraftB, setPairDraftB] = useState('');
  const [exclusionDraftSource, setExclusionDraftSource] = useState('');

  type StudioTab = 'library' | 'templates' | null;
  const [activeTab, setActiveTab] = useState<StudioTab>(null);
  const [collapsedLayerRules, setCollapsedLayerRules] = useState(false);
  const [collapsedPairs, setCollapsedPairs] = useState(true);
  const [collapsedExclusions, setCollapsedExclusions] = useState(true);
  const [collapsedStats, setCollapsedStats] = useState(true);
  const [gallerySeeds, setGallerySeeds] = useState<Array<{ selection: Record<string, string>; presetId: string | null }>>([]);
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
    void getAssetStore().listOutputs().then((outputs) => setOutputCount(outputs.length));
  }, [storeVersion]);

  const libraryRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (storeVersion === 0) return;
    if (libraryRefreshTimerRef.current) clearTimeout(libraryRefreshTimerRef.current);
    libraryRefreshTimerRef.current = setTimeout(() => {
      void getAssetStore().getLibrary().then((next) => {
        const sig = (lib: TraitLibrary | null) => lib
          ? lib.layers.map((l) => `${l.directoryName}:${l.traits.map((t) => `${t.relativePath}@${t.version}`).join('|')}`).join(';')
          : '';
        const nextSig = sig(next);
        const currentSig = sig(previousLibraryRef.current);
        if (nextSig === currentSig) return;
        applyLibrary(next, selectedTraitsRef.current);
      });
    }, 300);
    return () => {
      if (libraryRefreshTimerRef.current) clearTimeout(libraryRefreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeVersion]);

  useEffect(() => {
    if (!library) return;
    rerollGallery(galleryTileCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, galleryTileCount, rules, traitWeights]);

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
    const total = templateCapacity(orderedLayers, rules.template, traitWeights);
    return { total };
  }, [orderedLayers, rules, traitWeights]);

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

  const loadCanonicalRoot = useCallback(async () => {
    const store = getAssetStore();
    const project = await store.ensureDefaultProject();
    const nextRoot = `opfs:project/${project.id}`;
    setRootDirInput(nextRoot);
    setProjectName(project.name || 'Untitled Collection');

    const [nextLibrary, storedConfigs, weights] = await Promise.all([
      store.getLibrary(),
      store.listConfigs(),
      store.getWeights(),
    ]);

    const autosave = storedConfigs.find((config) => config.id === AUTOSAVE_ID) as
      | StoredGeneratorConfigFile
      | undefined;
    const hydrated = autosave ? hydrateSavedConfig({ ...autosave, rootDir: nextRoot }, nextLibrary) : null;
    const hydratedSelection = hydrated?.selectedTraits ?? selectedTraits;

    applyLibrary(nextLibrary, hydratedSelection);
    if (hydrated && hydrated.layerOrder.length > 0) {
      setLayerOrder(hydrated.layerOrder);
    }
    if (hydrated) {
      setEffects(normalizePreviewEffects(hydrated.effects));
      setRules(hydrated.rules);
    }
    setTraitWeights(weights);
    traitWeightsHydratedRef.current = true;
    setState({ loading: false, error: null });
    hydratedRef.current = true;
    return nextRoot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          selectedTraits: selectedTraitsRef.current,
          effects,
          rules,
        });
        await getAssetStore().saveConfig({
          id: config.id,
          name: config.name,
          layerOrder: config.layerOrder,
          selectedTraits: config.selectedTraits,
          effects: config.effects,
          rules: config.rules,
        });
        setAutosaveStatus('saved');
      } catch {
        setAutosaveStatus('error');
      }
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [layerOrder, effects, rules, library, rootDirInput]);

  useEffect(() => {
    if (!traitWeightsHydratedRef.current || !rootDirInput.trim()) return;
    if (traitWeightsTimerRef.current) clearTimeout(traitWeightsTimerRef.current);
    traitWeightsTimerRef.current = setTimeout(() => {
      void getAssetStore().setWeights(traitWeights);
    }, 700);
    return () => {
      if (traitWeightsTimerRef.current) clearTimeout(traitWeightsTimerRef.current);
    };
  }, [traitWeights, rootDirInput]);


  function updateTemplateLayerState(layerId: string, state: 'always' | 'never' | 'optional') {
    setRules((current) => ({
      ...current,
      template: setLayerTemplateState(current.template, layerId, state),
    }));
  }

  function updateTemplateLayerChance(layerId: string, chancePercent: number) {
    setRules((current) => ({
      ...current,
      template: setTemplateLayerRule(current.template, layerId, { chancePercent }),
    }));
  }

  function updateTemplateLayerSkips(layerId: string, excludeLayerIds: string[]) {
    setRules((current) => ({
      ...current,
      template: setTemplateLayerRule(current.template, layerId, { excludeLayerIds }),
    }));
  }

  function toggleTraitInTemplate(traitPath: string, included: boolean) {
    setRules((current) => {
      const set = new Set(current.template.excludedTraitPaths);
      if (included) set.delete(traitPath);
      else set.add(traitPath);
      return { ...current, template: { ...current.template, excludedTraitPaths: Array.from(set) } };
    });
  }

  function setLayerTraitsInTemplate(layer: TraitLayer, included: boolean) {
    setRules((current) => {
      const set = new Set(current.template.excludedTraitPaths);
      for (const trait of layer.traits) {
        if (included) set.delete(trait.relativePath);
        else set.add(trait.relativePath);
      }
      return { ...current, template: { ...current.template, excludedTraitPaths: Array.from(set) } };
    });
  }

  function addTraitPair(a: string, b: string) {
    if (!a || !b || a === b) return;
    setRules((current) => {
      const exists = current.traitPairs.some(
        (pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a),
      );
      if (exists) return current;
      return { ...current, traitPairs: [...current.traitPairs, { a, b }] };
    });
  }

  function removeTraitPair(index: number) {
    setRules((current) => ({
      ...current,
      traitPairs: current.traitPairs.filter((_, i) => i !== index),
    }));
  }

  function setLayerExclusion(sourceLayerId: string, excludeLayerIds: string[]) {
    setRules((current) => {
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
    setRules((current) => {
      if (current.layerExclusions.some((rule) => rule.sourceLayerId === sourceLayerId)) return current;
      return {
        ...current,
        layerExclusions: [...current.layerExclusions, { sourceLayerId, excludeLayerIds: [] }],
      };
    });
  }

  function removeLayerExclusion(sourceLayerId: string) {
    setRules((current) => ({
      ...current,
      layerExclusions: current.layerExclusions.filter((rule) => rule.sourceLayerId !== sourceLayerId),
    }));
  }

  function randomizeSelection() {
    if (!library) {
      return;
    }

    setActiveGalleryTileIndex(null);
    const { selection } = rollFromTemplate(library.layers, rules.template, traitWeights, Math.random, {
      traitPairs: rules.traitPairs,
      layerExclusions: rules.layerExclusions,
    });
    setSelectedTraits(buildPreviewSelectionFromGallerySeed(library.layers, selection));
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
        rules,
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
      const { selection } = rollFromTemplate(library.layers, rules.template, traitWeights, Math.random, {
        traitPairs: rules.traitPairs,
        layerExclusions: rules.layerExclusions,
      });
      const preset = PREVIEW_EFFECT_PRESETS.length > 0
        ? PREVIEW_EFFECT_PRESETS[Math.floor(Math.random() * PREVIEW_EFFECT_PRESETS.length)]
        : null;
      return { selection, presetId: preset?.id ?? null };
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
    setManageState({ loading: true, error: null, success: null });

    try {
      const store = getAssetStore();
      const action = payload.action as string;
      let library: TraitLibrary | null = null;
      let meta: Record<string, unknown> = {};

      switch (action) {
        case 'createLayer': {
          library = await store.createLayer(
            String(payload.layerName ?? ''),
            typeof payload.preferredOrder === 'number' ? (payload.preferredOrder as number) : undefined,
          );
          break;
        }
        case 'renameLayer': {
          const result = await store.renameLayer(
            String(payload.layerDirectoryName ?? ''),
            String(payload.nextLayerName ?? ''),
          );
          library = result.library;
          meta = result.meta;
          break;
        }
        case 'deleteLayer': {
          library = await store.deleteLayer(String(payload.layerDirectoryName ?? ''));
          break;
        }
        case 'renameTrait': {
          const result = await store.renameTrait(
            String(payload.assetRelativePath ?? ''),
            String(payload.nextFileName ?? ''),
          );
          library = result.library;
          meta = result.meta;
          break;
        }
        case 'deleteTrait': {
          library = await store.deleteTrait(String(payload.assetRelativePath ?? ''));
          break;
        }
        case 'reorderLayers': {
          library = await store.reorderLayers((payload.orderedDirectoryNames as string[]) ?? []);
          break;
        }
        default:
          throw new Error(`Unknown library action: ${action}`);
      }

      if (!library) throw new Error('Library operation returned no library.');
      const remap = options.computeRemap?.(meta) ?? {};
      applyLibrary(library, selectedTraits, options.focusRelativePath, remap);
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
    const impact = await getAssetStore().impactOfDeletingLayer(layer.directoryName);
    const summary: string[] = [];
    summary.push(`${layer.traits.length} trait${layer.traits.length === 1 ? '' : 's'} will be removed from OPFS.`);
    const r = impact.rulesAffected;
    if (r.alwaysMarked) summary.push('Layer is marked Always.');
    if (r.neverMarked) summary.push('Layer is marked Never.');
    if (r.exclusionSourceCount > 0) summary.push(`${r.exclusionSourceCount} layer-exclusion rule${r.exclusionSourceCount === 1 ? '' : 's'} source this layer.`);
    if (r.exclusionTargetCount > 0) summary.push(`${r.exclusionTargetCount} rule${r.exclusionTargetCount === 1 ? '' : 's'} exclude this layer as a target.`);
    if (r.traitPairsAffected > 0) summary.push(`${r.traitPairsAffected} trait pair${r.traitPairsAffected === 1 ? '' : 's'} reference these traits.`);
    if (r.configReferences > 0) summary.push(`${r.configReferences} saved config${r.configReferences === 1 ? '' : 's'} reference this layer.`);
    if (summary.length === 1) summary.push('No rules currently reference this layer.');

    setPendingDelete({
      kind: 'layer',
      label: layer.name,
      impactSummary: summary,
      confirm: async () => {
        await manageLibraryAction(
          { action: 'deleteLayer', layerDirectoryName: layer.directoryName },
          `Deleted layer “${layer.name}”.`,
        );
      },
    });
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
    const impact = await getAssetStore().impactOfDeletingTrait(trait.relativePath);
    const summary: string[] = [];
    if (impact.weightSet) summary.push('Trait has a custom rarity weight.');
    if (impact.excludedInRules) summary.push('Trait is on the excluded-traits list.');
    if (impact.traitPairsAffected > 0) summary.push(`${impact.traitPairsAffected} trait pair rule${impact.traitPairsAffected === 1 ? '' : 's'} reference this trait.`);
    if (impact.selectedInConfigs > 0) summary.push(`${impact.selectedInConfigs} saved config${impact.selectedInConfigs === 1 ? '' : 's'} currently select this trait.`);
    if (summary.length === 0) summary.push('No rules currently reference this trait.');

    setPendingDelete({
      kind: 'trait',
      label: trait.name,
      impactSummary: summary,
      confirm: async () => {
        await manageLibraryAction(
          { action: 'deleteTrait', assetRelativePath: trait.relativePath },
          `Deleted trait “${trait.name}”.`,
        );
      },
    });
  }

  async function replaceTraitWithFile(file: File, assetRelativePath: string) {
    if (!assetRelativePath) {
      setManageState({ loading: false, error: 'Choose a replacement target first.', success: null });
      return;
    }

    setManageState({ loading: true, error: null, success: null });

    try {
      const result = await getAssetStore().replaceTrait(assetRelativePath, file);
      applyLibrary(result.library, selectedTraits, result.replacement.relativePath);
      setManageState({ loading: false, error: null, success: `Replaced ${result.replacement.fileName}.` });
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
    if (!layerName.trim()) {
      setManageState({ loading: false, error: 'Choose a target layer before creating a pasted trait.', success: null });
      return;
    }

    setManageState({ loading: true, error: null, success: null });

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = buildNewTraitFileName(traitName);
      const result = await getAssetStore().uploadTrait({
        layerName: layerName.trim(),
        fileName,
        blob,
        displayName: traitName,
        preferredOrder: preferredOrder && Number.isFinite(preferredOrder) ? preferredOrder : undefined,
      });

      applyLibrary(result.library, selectedTraits, result.upload.relativePath);
      setReplaceTargetAssetPath(result.upload.relativePath);
      setPendingNewTrait(null);
      setManageState({ loading: false, error: null, success: `Created new trait “${result.upload.fileName}”.` });
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

  const forgeStatusLabel = library ? 'Forge armed' : 'Awaiting root';

  async function commitProjectRename() {
    const trimmed = projectNameDraft.trim();
    setRenamingProject(false);
    if (!trimmed || trimmed === projectName) return;
    try {
      const store = getAssetStore();
      const project = await store.getActiveProject();
      if (project) {
        await store.renameProject(project.id, trimmed);
        setProjectName(trimmed);
      }
    } catch {
      // Non-fatal — keep the old name.
    }
  }

  const autosaveLabel =
    autosaveStatus === 'saving' ? 'Autosaving…'
      : autosaveStatus === 'saved' ? 'Autosaved'
      : autosaveStatus === 'error' ? 'Autosave failed'
      : hydratedRef.current ? 'Idle' : 'Loading…';

  return (
    <main className="studio-shell">
      <div style={{ position: 'relative' }}>
        <span
          className="uru-tape uru-tape-mizuiro"
          aria-hidden="true"
          style={{ position: 'absolute', top: -8, left: 40, transform: 'rotate(-4deg)', zIndex: 2 }}
        />
        <header className="studio-toolbar uru-shell">
          <div className="studio-toolbar-inner">
            <div className="studio-toolbar-title-row">
              <h1 className="uru-h1" style={{ fontSize: 'clamp(28px, 4vw, 44px)', margin: 0 }}>
                urufulabs<span style={{ color: 'var(--pink-hot)' }}>studio</span> trait forge
              </h1>
              {renamingProject ? (
                <input
                  className="uru-input"
                  autoFocus
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  onBlur={() => void commitProjectRename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitProjectRename();
                    if (event.key === 'Escape') { setRenamingProject(false); setProjectNameDraft(projectName); }
                  }}
                  style={{ maxWidth: 260 }}
                />
              ) : (
                <button
                  type="button"
                  className="uru-stamp uru-stamp-cream"
                  onClick={() => { setProjectNameDraft(projectName); setRenamingProject(true); }}
                  title="Click to rename this collection"
                  style={{ maxWidth: 260, cursor: 'pointer' }}
                >
                  ✿ {projectName}
                </button>
              )}
            </div>
            <div className="studio-toolbar-stamps">
              <span className="uru-stamp uru-stamp-mint">{forgeStatusLabel}</span>
              <span className="uru-stamp uru-stamp-cream">
                <span className="uru-num">{library?.layers.length ?? 0}</span> layers
              </span>
              <span className="uru-stamp uru-stamp-mizuiro">
                <span className="uru-num">{totalTraitCount}</span> traits
              </span>
              <span
                className={`uru-stamp autosave-chip autosave-${autosaveStatus} ${
                  autosaveStatus === 'saving'
                    ? 'uru-stamp-yolk uru-idle-bob'
                    : autosaveStatus === 'error'
                      ? 'uru-stamp-pink'
                      : 'uru-stamp-mint'
                }`}
              >
                {autosaveLabel}
              </span>
            </div>
            <div className="studio-toolbar-actions">
              <button className="uru-btn uru-btn-primary" onClick={randomizeSelection} type="button" disabled={!library}>
                Preview single token ✿
              </button>
              <button className="uru-btn uru-btn-cream" onClick={loadLibrary} type="button" disabled={state.loading}>
                {state.loading ? 'Loading…' : 'Reload'}
              </button>
            </div>
          </div>
        </header>
      </div>

      {state.error ? (
        <div
          className="uru-shell-tight error-banner"
          role="alert"
          style={{
            borderColor: 'var(--pink-hot)',
            background: 'var(--pink-warm)',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {state.error}
        </div>
      ) : null}

      <StudioSteps
        hasLayers={Boolean(library && library.layers.length > 0)}
        hasOutputs={outputCount > 0}
        publishedCid={null}
      />

      <UploadDropzone onImport={() => void loadLibrary()} />

      <datalist id="layer-name-options">
        {layerNameSuggestions.map((layerName) => (
          <option key={layerName} value={layerName} />
        ))}
      </datalist>

      <section className="studio-grid studio-grid-compact">
        <aside className="uru-shell panel panel-layers">
          <div className="panel-header panel-header-tight">
            <h2 className="uru-h2">Layers</h2>
          </div>

          {orderedLayers.length === 0 ? (
            <div className="uru-bubble empty-state">
              Load a root directory to populate layers.
            </div>
          ) : (
            <div className="layer-list-compact">
              {orderedLayers.map((layer, index) => {
                const selected = selectedTraits[layer.id] ?? '';
                const selectedTrait = layer.traits.find((trait) => trait.id === selected) ?? null;
                const armed = pendingNewTrait?.layerName?.toLowerCase() === layer.name.toLowerCase();
                const replaceArmed = !!selectedTrait && pendingReplaceTarget?.relativePath === selectedTrait.relativePath;
                return (
                  <article
                    className={`layer-card layer-card-compact uru-polaroid${armed ? ' layer-card-armed' : ''}${replaceArmed ? ' layer-card-armed-replace' : ''}`}
                    key={layer.id}
                    data-active={armed || replaceArmed ? 'true' : undefined}
                  >
                    <div className="layer-card-row layer-card-compact-body">
                      <div className="layer-card-order layer-reorder-stack">
                        <button
                          className="uru-chip icon-button"
                          type="button"
                          disabled={index === 0}
                          aria-label={`Move ${layer.name} up`}
                          onClick={() => reorderLayer(index, -1)}
                        >
                          ↑
                        </button>
                        <span className="uru-eyebrow layer-index-mini">#{index + 1}</span>
                        <button
                          className="uru-chip icon-button"
                          type="button"
                          disabled={index === orderedLayers.length - 1}
                          aria-label={`Move ${layer.name} down`}
                          onClick={() => reorderLayer(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                      <div className="uru-shell-inner-inner">
                        <div className="layer-trait-thumb">
                          {(() => {
                            if (!selectedTrait || !library) return <span className="layer-trait-thumb-empty">—</span>;
                            const src = buildAssetUrl(library.rootDir, selectedTrait);
                            return src ? (
                              <img alt={`${layer.name}: ${selectedTrait.name}`} src={src} />
                            ) : (
                              <span className="layer-trait-thumb-empty">…</span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="layer-card-compact-main">
                        <div className="layer-card-compact-head" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          <input
                            className="uru-input"
                            style={{ fontSize: 17, fontWeight: 700, maxWidth: 200 }}
                            value={renameLayerDrafts[layer.directoryName] ?? layer.name}
                            onChange={(event) => setRenameLayerDrafts((current) => ({ ...current, [layer.directoryName]: event.target.value }))}
                            onBlur={() => {
                              const draft = (renameLayerDrafts[layer.directoryName] || '').trim();
                              if (draft && draft !== layer.name) void renameLayer(layer);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                              if (event.key === 'Escape') setRenameLayerDrafts((current) => ({ ...current, [layer.directoryName]: layer.name }));
                            }}
                            aria-label={`Rename layer ${layer.name}`}
                          />
                          <span className="uru-eyebrow layer-meta">
                            <span className="uru-num">{layer.traits.length}</span> traits
                          </span>
                          <button
                            type="button"
                            className="uru-btn uru-btn-danger"
                            style={{ marginLeft: 'auto' }}
                            disabled={manageState.loading}
                            onClick={() => void deleteLayer(layer)}
                            title={`Delete layer “${layer.name}”`}
                          >
                            Delete layer
                          </button>
                        </div>
                        <div className="layer-card-actions layer-card-compact-row">
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
                            className={`uru-btn${armed ? ' uru-btn-mint' : ''}`}
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
                            className="uru-btn"
                            type="button"
                            disabled={layer.traits.length === 0}
                            onClick={() => randomizeLayer(layer)}
                            title="Pick a random trait from this layer (respects rarity weights)"
                          >
                            Random
                          </button>
                        </div>
                        {selectedTrait ? (
                          <div className="layer-card-actions layer-card-compact-row">
                            <input
                              className="uru-input layer-trait-select"
                              value={renameTraitDrafts[selectedTrait.relativePath] ?? selectedTrait.name}
                              onChange={(event) => setRenameTraitDrafts((current) => ({ ...current, [selectedTrait.relativePath]: event.target.value }))}
                              placeholder="Trait name"
                              type="text"
                            />
                            <button
                              className="uru-btn"
                              type="button"
                              disabled={manageState.loading}
                              onClick={() => void renameTrait(selectedTrait)}
                            >
                              Rename
                            </button>
                            <button
                              className={`uru-btn uru-btn-primary${replaceArmed ? ' active-reference-chip' : ''}`}
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
                              className="uru-btn uru-btn-danger danger-button"
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


      <section className="uru-shell panel manager-panel tab-panel" id="library-manager">
        <div className="panel-header compact-panel-header panel-header-collapsible">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="uru-h2">Layer + trait management</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>Create layers, persist reordered folders, rename selected traits, delete assets, create new pasted traits, and replace a target image by file upload or Ctrl+V paste.</p>
          </div>
          <button
            type="button"
            className="uru-chip panel-minimize"
            aria-label={activeTab === 'library' ? 'Minimize library manager' : 'Expand library manager'}
            aria-expanded={activeTab === 'library'}
            onClick={() => setActiveTab((current) => (current === 'library' ? null : 'library'))}
          >
            {activeTab === 'library' ? '−' : '＋'}
          </button>
        </div>
        {activeTab === 'library' ? (<>
        <div className="manager-grid">
          <label className="field-group">
            <span>New layer name</span>
            <input className="uru-input" value={newLayerName} onChange={(event) => setNewLayerName(event.target.value)} placeholder="Headwear" type="text" />
          </label>
          <label className="field-group">
            <span>Layer order (optional)</span>
            <input className="uru-input" value={newLayerOrder} onChange={(event) => setNewLayerOrder(event.target.value)} inputMode="numeric" min="1" type="number" placeholder="Auto" />
          </label>
          <button className="uru-btn uru-btn-primary" type="button" onClick={createLayer} disabled={manageState.loading}>
            Create layer
          </button>
          <button className="uru-btn" type="button" onClick={persistLayerOrder} disabled={!library || manageState.loading}>
            Persist layer order
          </button>
        </div>

        {orderedLayers.length > 0 ? (
          <div className="layer-manager-list">
            <h3 className="uru-h2" style={{ fontSize: 16 }}>Existing layers (<span className="uru-num">{orderedLayers.length}</span>)</h3>
            {orderedLayers.map((layer) => (
              <div className="layer-manager-row" key={layer.directoryName}>
                <div className="layer-manager-meta">
                  <strong>{layer.name}</strong>
                  <span className="uru-eyebrow preset-meta"><span className="uru-num">{layer.traits.length}</span> trait{layer.traits.length === 1 ? '' : 's'} · {layer.directoryName}/</span>
                </div>
                <input
                  className="uru-input"
                  type="text"
                  value={renameLayerDrafts[layer.directoryName] ?? layer.name}
                  onChange={(event) => setRenameLayerDrafts((current) => ({ ...current, [layer.directoryName]: event.target.value }))}
                  placeholder="New layer name"
                />
                <button
                  className="uru-btn"
                  type="button"
                  disabled={manageState.loading || !(renameLayerDrafts[layer.directoryName] || '').trim() || (renameLayerDrafts[layer.directoryName] || '').trim() === layer.name}
                  onClick={() => void renameLayer(layer)}
                >
                  Rename
                </button>
                <button
                  className="uru-btn uru-btn-danger danger-button"
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
            <h3 className="uru-h2" style={{ fontSize: 16 }}>Trait rarities</h3>
            <p className="uru-eyebrow preset-meta">Weights are relative within a layer. Default 1. Higher = more common. 0 = never roll. Stored in <code>{'<root>/.studio-weights.json'}</code>.</p>
            {orderedLayers.map((layer) => (
              <details className="weights-layer" key={layer.id}>
                <summary>
                  <strong>{layer.name}</strong>
                  <span className="uru-eyebrow preset-meta"><span className="uru-num">{layer.traits.length}</span> trait{layer.traits.length === 1 ? '' : 's'}</span>
                </summary>
                {layer.traits.length === 0 ? (
                  <div className="uru-bubble empty-state">No traits in this layer yet.</div>
                ) : (
                  <ul className="weights-trait-list">
                    {layer.traits.map((trait) => {
                      const weight = traitWeights[trait.relativePath] ?? DEFAULT_TRAIT_WEIGHT;
                      const weightsThumbSrc = buildAssetUrl(library!.rootDir, trait);
                      return (
                        <li className="weights-trait-row" key={trait.relativePath}>
                          {weightsThumbSrc ? <img alt={trait.name} className="weights-trait-thumb" src={weightsThumbSrc} /> : <span className="weights-trait-thumb" aria-hidden />}
                          <span className="weights-trait-name">{trait.name}</span>
                          <input
                            className="uru-input"
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
                                className={`uru-chip weights-chip${weight === value ? ' weights-chip-active' : ''}`}
                                data-active={weight === value ? 'true' : undefined}
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
            <select className="uru-input" value={replaceTargetAssetPath} onChange={(event) => setReplaceTargetAssetPath(event.target.value)}>
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
            className="uru-btn"
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
              className="uru-input"
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
              className="uru-input"
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
            className="uru-btn"
            type="button"
            disabled={manageState.loading || !(pendingTraitDraft.layerName.trim())}
            onClick={() => startNewPastedTrait(pendingTraitDraft.layerName, pendingTraitDraft.traitName)}
          >
            Arm paste-create
          </button>
          <button
            className="uru-btn uru-btn-primary"
            type="button"
            disabled={manageState.loading || !(pendingTraitDraft.layerName.trim())}
            onClick={() => startNewPastedTrait(pendingTraitDraft.layerName, pendingTraitDraft.traitName, true)}
          >
            Auto-create on paste
          </button>
        </div>

        {lastPastedImage ? (
          <div className="uru-shell-inner reference-block sticky-paste-block">
            <h3 className="uru-h2" style={{ fontSize: 16 }}>Last pasted image</h3>
            <div className="sticky-paste-row">
              <img alt={lastPastedImage.name} className="sticky-paste-image" src={lastPastedImage.dataUrl} />
              <div className="pasted-image-actions">
                <strong>{lastPastedImage.name}</strong>
                <span className="uru-eyebrow preset-meta">Quick actions for the most recent paste.</span>
                <div className="preset-actions">
                  <button
                    className="uru-btn"
                    type="button"
                    disabled={!replaceTargetAssetPath || manageState.loading}
                    onClick={() => void replaceTraitWithDataUrl(lastPastedImage.dataUrl, replaceTargetAssetPath, lastPastedImage.name)}
                  >
                    Paste over selected trait
                  </button>
                  <button
                    className="uru-btn uru-btn-mint"
                    type="button"
                    disabled={manageState.loading}
                    onClick={() => void createTraitFromDataUrl(lastPastedImage.dataUrl, pendingTraitDraft.layerName, pendingTraitDraft.traitName)}
                  >
                    Create from last paste
                  </button>
                  <button
                    className="uru-btn uru-btn-danger danger-button"
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
          <div className="uru-shell-inner reference-block pending-paste-block">
            <h3 className="uru-h2" style={{ fontSize: 16 }}>{pendingNewTrait.autoCreateOnPaste ? 'Auto-create armed' : 'Paste-create armed'}</h3>
            <p className="uru-eyebrow preset-meta">
              {pendingNewTrait.autoCreateOnPaste
                ? `Next Ctrl+V image will immediately create “${pendingTraitDraft.traitName}” in ${pendingTraitDraft.layerName}.`
                : `Next Ctrl+V image will create “${pendingTraitDraft.traitName}” in ${pendingTraitDraft.layerName}. Then you can paste again to overwrite that created trait.`}
            </p>
            <div className="preset-actions">
              <button className="uru-btn" type="button" onClick={() => setPendingNewTrait(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {manageState.error ? (
          <div
            className="uru-shell-tight error-banner"
            role="alert"
            style={{
              borderColor: 'var(--pink-hot)',
              background: 'var(--pink-warm)',
              fontFamily: 'var(--font-pixel), monospace',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {manageState.error}
          </div>
        ) : null}
        {manageState.success ? (
          <div
            className="uru-shell-tight success-banner"
            role="status"
            style={{
              borderColor: 'var(--mint-hot)',
              background: 'var(--mint)',
              fontFamily: 'var(--font-pixel), monospace',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {manageState.success}
          </div>
        ) : null}
        </>) : null}
      </section>

      <section className="uru-shell panel tab-panel" id="collection-rules">
        <div className="panel-header compact-panel-header panel-header-collapsible">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="uru-h2">Collection rules</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>Mark each layer as Always (must include), Never (skipped), or Optional. Optional layers get an appearance chance and can skip other layers when they roll. Trait pairs and layer exclusions apply on top of these rules.</p>
          </div>
          <button
            type="button"
            className="uru-chip panel-minimize"
            aria-label={activeTab === 'templates' ? 'Minimize collection rules' : 'Expand collection rules'}
            aria-expanded={activeTab === 'templates'}
            onClick={() => setActiveTab((current) => (current === 'templates' ? null : 'templates'))}
          >
            {activeTab === 'templates' ? '−' : '＋'}
          </button>
        </div>
        {activeTab === 'templates' ? (<>
        {orderedLayers.length === 0 ? (
          <div className="uru-bubble empty-state">Load a root directory to configure rules.</div>
        ) : (
          <div className="uru-shell-inner template-card">
            <div className="panel-header-collapsible">
              <h3 className="uru-h2" style={{ fontSize: 16, margin: 0 }}>Layer rules</h3>
              <button
                type="button"
                className="uru-chip panel-minimize"
                aria-label={collapsedLayerRules ? 'Expand layer rules' : 'Minimize layer rules'}
                aria-expanded={!collapsedLayerRules}
                onClick={() => setCollapsedLayerRules((v) => !v)}
              >
                {collapsedLayerRules ? '＋' : '−'}
              </button>
            </div>
            {!collapsedLayerRules ? (
            <ul className="template-layer-list">
              {orderedLayers.map((layer) => {
                const state = getLayerTemplateState(rules.template, layer.id);
                const layerRule = getTemplateLayerRule(rules.template, layer.id);
                const chancePercent = state === 'always' ? 100 : state === 'never' ? 0 : layerRule.chancePercent;
                const skipCount = layerRule.excludeLayerIds.length;
                const excludedSet = new Set(rules.template.excludedTraitPaths);
                const includedCount = layer.traits.filter((t) => !excludedSet.has(t.relativePath)).length;
                const allIncluded = layer.traits.length > 0 && includedCount === layer.traits.length;
                return (
                  <li className="template-layer-row" key={layer.id}>
                    <div className="template-layer-row-head">
                      <div className="template-layer-name">
                        <strong>{layer.name}</strong>
                        <span className="uru-eyebrow preset-meta">
                          <span className="uru-num">{includedCount}</span>/<span className="uru-num">{layer.traits.length}</span> trait{layer.traits.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="template-toggle" role="group" aria-label={`${layer.name} state`}>
                        {(['always', 'optional', 'never'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`uru-chip template-toggle-button template-toggle-${opt}${state === opt ? ' template-toggle-active' : ''}`}
                            data-active={state === opt ? 'true' : undefined}
                            onClick={() => updateTemplateLayerState(layer.id, opt)}
                          >
                            {opt === 'always' ? 'Always' : opt === 'never' ? 'Never' : 'Optional'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {state !== 'never' ? (
                      <div className="template-layer-rule-strip">
                        <label className="template-layer-chance">
                          <span className="uru-eyebrow">Appears</span>
                          <input
                            className="uru-input"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={chancePercent}
                            disabled={state !== 'optional'}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              updateTemplateLayerChance(layer.id, Number.isFinite(next) ? next : 0);
                            }}
                          />
                          <span>%</span>
                        </label>
                        {state === 'optional' ? (
                          <input
                            aria-label={`${layer.name} appearance chance`}
                            className="template-layer-chance-range"
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={chancePercent}
                            onChange={(event) => updateTemplateLayerChance(layer.id, Number(event.target.value))}
                          />
                        ) : (
                          <span className="uru-eyebrow preset-meta">Always uses 100%</span>
                        )}
                      </div>
                    ) : null}
                    {state !== 'never' ? (
                      <details className="template-layer-conditional">
                        <summary>
                          <span>Skips when present</span>
                          <span className="uru-eyebrow preset-meta">
                            {skipCount === 0 ? 'none' : <><span className="uru-num">{skipCount}</span> layer{skipCount === 1 ? '' : 's'}</>}
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
                                  className={`uru-chip layer-exclusion-pill${checked ? ' layer-exclusion-pill-active' : ''}`}
                                  data-active={checked ? 'true' : undefined}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                      const next = new Set(layerRule.excludeLayerIds);
                                      if (event.target.checked) next.add(targetLayer.id);
                                      else next.delete(targetLayer.id);
                                      updateTemplateLayerSkips(layer.id, Array.from(next));
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
                          <span className="uru-eyebrow preset-meta">
                            {includedCount === layer.traits.length
                              ? 'all included'
                              : <><span className="uru-num">{includedCount}</span> included, <span className="uru-num">{layer.traits.length - includedCount}</span> excluded</>}
                          </span>
                        </summary>
                        <div className="template-trait-subset-actions">
                          <button
                            type="button"
                            className="uru-btn"
                            disabled={allIncluded}
                            onClick={() => setLayerTraitsInTemplate(layer, true)}
                          >
                            Include all
                          </button>
                          <button
                            type="button"
                            className="uru-btn"
                            disabled={includedCount === 0}
                            onClick={() => setLayerTraitsInTemplate(layer, false)}
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
                                    onChange={(event) => toggleTraitInTemplate(trait.relativePath, event.target.checked)}
                                  />
                                  {(() => {
                                    if (!library) return null;
                                    const s = buildAssetUrl(library.rootDir, trait);
                                    return s ? <img alt={trait.name} className="template-trait-subset-thumb" src={s} /> : null;
                                  })()}
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
            ) : null}
          </div>
        )}

        {orderedLayers.length > 0 ? (
          <div className="uru-shell-inner rules-card">
            <div className="panel-header compact-panel-header panel-header-collapsible">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="uru-h2" style={{ fontSize: 16 }}>Trait pairs</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>Bidirectional. When trait A is rolled, force trait B's layer to B. Useful for matching tail/hair colorways.</p>
              </div>
              <button
                type="button"
                className="uru-chip panel-minimize"
                aria-label={collapsedPairs ? 'Expand trait pairs' : 'Minimize trait pairs'}
                aria-expanded={!collapsedPairs}
                onClick={() => setCollapsedPairs((v) => !v)}
              >
                {collapsedPairs ? '＋' : '−'}
              </button>
            </div>
            {!collapsedPairs ? (<>
            <div className="trait-pair-add">
              <select className="uru-input" value={pairDraftA} onChange={(event) => setPairDraftA(event.target.value)}>
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
              <select className="uru-input" value={pairDraftB} onChange={(event) => setPairDraftB(event.target.value)}>
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
                className="uru-btn uru-btn-primary"
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
            {rules.traitPairs.length === 0 ? (
              <div className="uru-bubble empty-state">No pairs yet.</div>
            ) : (
              <ul className="trait-pair-list">
                {rules.traitPairs.map((pair, index) => {
                  const aLayer = orderedLayers.find((layer) => layer.traits.some((t) => t.relativePath === pair.a));
                  const aTrait = aLayer?.traits.find((t) => t.relativePath === pair.a) ?? null;
                  const bLayer = orderedLayers.find((layer) => layer.traits.some((t) => t.relativePath === pair.b));
                  const bTrait = bLayer?.traits.find((t) => t.relativePath === pair.b) ?? null;
                  return (
                    <li className="trait-pair-row" key={`${pair.a}|${pair.b}`}>
                      <div className="trait-pair-side">
                        {(() => {
                          if (!library || !aTrait) return null;
                          const s = buildAssetUrl(library.rootDir, aTrait);
                          return s ? <img alt={aTrait.name} src={s} className="trait-pair-thumb" /> : null;
                        })()}
                        <div>
                          <strong>{aTrait?.name ?? pair.a}</strong>
                          <span className="uru-eyebrow preset-meta">{aLayer?.name ?? '?'}</span>
                        </div>
                      </div>
                      <span className="pair-arrow">↔</span>
                      <div className="trait-pair-side">
                        {(() => {
                          if (!library || !bTrait) return null;
                          const s = buildAssetUrl(library.rootDir, bTrait);
                          return s ? <img alt={bTrait.name} src={s} className="trait-pair-thumb" /> : null;
                        })()}
                        <div>
                          <strong>{bTrait?.name ?? pair.b}</strong>
                          <span className="uru-eyebrow preset-meta">{bLayer?.name ?? '?'}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="uru-btn uru-btn-danger danger-button"
                        onClick={() => removeTraitPair(index)}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            </>) : null}
          </div>
        ) : null}

        {orderedLayers.length > 0 ? (
          <div className="uru-shell-inner rules-card">
            <div className="panel-header compact-panel-header panel-header-collapsible">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="uru-h2" style={{ fontSize: 16 }}>Global layer exclusions</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>Extra layer skip rules that apply whenever the source layer rolls. Use the per-layer &quot;Skips when present&quot; control above for scoped skips.</p>
              </div>
              <button
                type="button"
                className="uru-chip panel-minimize"
                aria-label={collapsedExclusions ? 'Expand global layer exclusions' : 'Minimize global layer exclusions'}
                aria-expanded={!collapsedExclusions}
                onClick={() => setCollapsedExclusions((v) => !v)}
              >
                {collapsedExclusions ? '＋' : '−'}
              </button>
            </div>
            {!collapsedExclusions ? (<>
            <div className="layer-exclusion-add">
              <label className="field-group">
                <span>Source layer</span>
                <select className="uru-input" value={exclusionDraftSource} onChange={(event) => setExclusionDraftSource(event.target.value)}>
                  <option value="">— pick a layer —</option>
                  {orderedLayers
                    .filter((layer) => !rules.layerExclusions.some((rule) => rule.sourceLayerId === layer.id))
                    .map((layer) => (
                      <option key={layer.id} value={layer.id}>{layer.name}</option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="uru-btn uru-btn-primary"
                disabled={!exclusionDraftSource}
                onClick={() => {
                  addLayerExclusion(exclusionDraftSource);
                  setExclusionDraftSource('');
                }}
              >
                Add rule
              </button>
            </div>
            {rules.layerExclusions.length === 0 ? (
              <div className="uru-bubble empty-state">No exclusion rules yet.</div>
            ) : (
              <ul className="layer-exclusion-list">
                {rules.layerExclusions.map((rule) => {
                  const sourceLayer = orderedLayers.find((layer) => layer.id === rule.sourceLayerId);
                  const excludedSet = new Set(rule.excludeLayerIds);
                  return (
                    <li className="layer-exclusion-row" key={rule.sourceLayerId}>
                      <div className="layer-exclusion-head">
                        <strong>When {sourceLayer?.name ?? rule.sourceLayerId} rolls →</strong>
                        <button
                          type="button"
                          className="uru-btn uru-btn-danger danger-button"
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
                              <label
                                key={layer.id}
                                className={`uru-chip layer-exclusion-pill${checked ? ' layer-exclusion-pill-active' : ''}`}
                                data-active={checked ? 'true' : undefined}
                              >
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
            </>) : null}
          </div>
        ) : null}

        <div className="uru-shell-inner stats-card">
          <div className="stats-card-head panel-header-collapsible">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="uru-h2" style={{ fontSize: 16 }}>Collection stats</h3>
              <p className="uru-eyebrow preset-meta">Capacity is the deterministic upper bound (product of viable traits per non-Never layer). Simulation runs the actual weighted roll to estimate how many uniques you'll get under your rarity setup.</p>
            </div>
            <button
              type="button"
              className="uru-chip panel-minimize"
              aria-label={collapsedStats ? 'Expand collection stats' : 'Minimize collection stats'}
              aria-expanded={!collapsedStats}
              onClick={() => setCollapsedStats((v) => !v)}
            >
              {collapsedStats ? '＋' : '−'}
            </button>
          </div>
          {!collapsedStats ? (<>
          <div className="stats-controls">
            <label className="field-group">
              <span>Target collection size</span>
              <input
                className="uru-input"
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
              className="uru-btn uru-btn-primary"
              type="button"
              disabled={simulationRunning || orderedLayers.length === 0}
              onClick={runSimulation}
            >
              {simulationRunning ? 'Simulating…' : 'Simulate'}
            </button>
          </div>

          <div className="stats-grid">
            <div className={`stats-readout${capacities.total < targetCollectionSize ? ' stats-readout-warn' : ''}`}>
              <span className="uru-eyebrow stats-label">Capacity</span>
              <strong className="uru-num">{capacities.total.toLocaleString()}</strong>
              {capacities.total < targetCollectionSize ? (
                <span className="stats-warn-text">Below target (<span className="uru-num">{targetCollectionSize.toLocaleString()}</span>). Add traits or remove Never layers.</span>
              ) : null}
            </div>
            {simulationResult ? (
              <div className={`stats-readout${simulationResult.uniqueCount < simulationResult.targetSize ? ' stats-readout-warn' : ''}`}>
                <span className="uru-eyebrow stats-label">Simulated unique</span>
                <strong><span className="uru-num">{simulationResult.uniqueCount.toLocaleString()}</span> / <span className="uru-num">{simulationResult.targetSize.toLocaleString()}</span></strong>
                <span className="uru-eyebrow preset-meta">
                  <span className="uru-num">{simulationResult.totalAttempts.toLocaleString()}</span> attempts
                </span>
                {simulationResult.missingAlwaysEvents > 0 ? (
                  <span className="stats-warn-text"><span className="uru-num">{simulationResult.missingAlwaysEvents.toLocaleString()}</span> rolls missed an Always layer (no viable trait).</span>
                ) : null}
                {simulationResult.uniqueCount < simulationResult.targetSize ? (
                  <span className="stats-warn-text">Couldn't hit target before attempt cap. Either capacity is too low or weights are too skewed.</span>
                ) : null}
              </div>
            ) : null}
          </div>

          {simulationResult ? (
            <div className="stats-trait-list">
              <h4 className="uru-h2" style={{ fontSize: 15 }}>Per-trait counts</h4>
              {orderedLayers.map((layer) => {
                const layerStats = simulationResult.traitStats.filter((stat) => stat.layerId === layer.id);
                if (layerStats.length === 0) return null;
                const sorted = [...layerStats].sort((a, b) => b.count - a.count);
                return (
                  <details className="stats-layer-block" key={layer.id}>
                    <summary>
                      <strong>{layer.name}</strong>
                      <span className="uru-eyebrow preset-meta"><span className="uru-num">{sorted.length}</span> trait{sorted.length === 1 ? '' : 's'}</span>
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
                            <td className="uru-num">{stat.weight}</td>
                            <td className="uru-num">{stat.count.toLocaleString()}</td>
                            <td className="uru-num">{simulationResult.uniqueCount > 0 ? ((stat.count / simulationResult.uniqueCount) * 100).toFixed(1) : '0.0'}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                );
              })}
            </div>
          ) : null}
          </>) : null}
        </div>
        </>) : null}
      </section>

      <section className="uru-shell panel collection-preview-panel">
          <div className="panel-header compact-panel-header">
            <h2 className="uru-h2">Random rolls preview (<span className="uru-num">{gallerySeeds.length}</span>)</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--anchor-soft)', fontFamily: 'var(--font-round), Klee One, cursive', fontSize: 13 }}>
              <strong>Design-time only.</strong> Random rolls using your current weights and rules — for sanity-checking rarity balance. These are <em>not</em> your final collection. Hit Generate below to render the real tokens.
            </p>
          </div>
          <div className="gallery-toolbar">
            <label className="field-group">
              <span>Tile count</span>
              <select
                className="uru-input"
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
              <select className="uru-input" value={galleryTileSize} onChange={(event) => setGalleryTileSize(event.target.value as GalleryTileSize)}>
                <option value="s">Small</option>
                <option value="m">Medium</option>
                <option value="l">Large</option>
                <option value="xl">XL</option>
              </select>
            </label>
            <button
              className={`uru-btn${galleryEffectsEnabled ? ' uru-btn-mint' : ''}`}
              type="button"
              onClick={() => setGalleryEffectsEnabled((current) => !current)}
              title="Toggle the random per-NFT effect preset on the collection preview"
            >
              {galleryEffectsEnabled ? 'Effects on' : 'Effects off'}
            </button>
            <button className="uru-btn uru-btn-primary" type="button" onClick={() => rerollGallery()} disabled={!library}>
              Reroll
            </button>
          </div>
          {!library ? (
            <div className="uru-bubble empty-state">Load a root directory to preview a randomized collection.</div>
          ) : gallerySeeds.length === 0 ? (
            <div className="uru-bubble empty-state">Click Reroll to generate <span className="uru-num">{galleryTileCount}</span> random combinations.</div>
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
                    className={`uru-polaroid gallery-tile gallery-tile-button${activeGalleryTileIndex === index ? ' gallery-tile-active' : ''}`}
                    key={index}
                    type="button"
                    data-active={activeGalleryTileIndex === index ? 'true' : undefined}
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
                    <span className="uru-stamp uru-stamp-cream gallery-tile-index">#<span className="uru-num">{index + 1}</span></span>
                    {galleryEffectsEnabled && presetLabel ? (
                      <span className="uru-stamp uru-stamp-pink gallery-tile-preset-badge">{presetLabel}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

      <CollectionGenerator
        library={library}
        rules={rules}
        weights={traitWeights}
        targetCollectionSize={targetCollectionSize}
        onTargetChange={setTargetCollectionSize}
      />

      <CollectionBrowser library={library} rules={rules} weights={traitWeights} />

      <DownloadPanel outputCount={outputCount} />

      <IpfsPushPanel outputCount={outputCount} />

      {pendingDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(58,44,58,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 100,
          }}
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="uru-shell"
            style={{ maxWidth: 520, width: '100%' }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="uru-h2" style={{ margin: 0 }}>
              Delete {pendingDelete.kind} “{pendingDelete.label}”?
            </h3>
            <ul className="uru-list-flower" style={{ marginTop: 12 }}>
              {pendingDelete.impactSummary.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
            <p className="uru-eyebrow" style={{ marginTop: 12 }}>
              Deleting cascades: OPFS blobs removed, rules cleaned up. Cannot undo.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="uru-btn uru-btn-danger"
                onClick={async () => {
                  const action = pendingDelete.confirm;
                  setPendingDelete(null);
                  await action();
                }}
              >
                Delete anyway
              </button>
              <button
                type="button"
                className="uru-btn uru-btn-cream"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </main>
  );
}

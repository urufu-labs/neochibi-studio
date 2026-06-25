import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TEMPLATES,
  getTemplateLayerRule,
  getLayerTemplateState,
  normalizeCollectionTemplates,
  pickTemplateKind,
  pickWeightedTrait,
  rollFromTemplate,
  setLayerTemplateState,
  setTemplateLayerRule,
  simulateCollection,
  templateCapacity,
} from '../lib/art-generator/rules';
import type { TraitLayer } from '../lib/art-generator/types';

const sampleLayers: TraitLayer[] = [
  {
    id: 'background',
    name: 'Background',
    directoryName: '01 Background',
    traits: [
      { id: 'bg-dawn', name: 'Dawn', relativePath: '01 Background/01 Dawn.png', extension: 'png', version: 0 },
      { id: 'bg-night', name: 'Night', relativePath: '01 Background/02 Night.png', extension: 'png', version: 0 },
    ],
  },
  {
    id: 'body',
    name: 'Body',
    directoryName: '02 Body',
    traits: [
      { id: 'body-cream', name: 'Cream', relativePath: '02 Body/01 Cream.png', extension: 'png', version: 0 },
      { id: 'body-ghost', name: 'Ghost', relativePath: '02 Body/02 Ghost.png', extension: 'png', version: 0 },
    ],
  },
  {
    id: 'hat',
    name: 'Hat',
    directoryName: '03 Hat',
    traits: [],
  },
];

function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

test('rollFromTemplate excludes layers in neverLayerIds', () => {
  const { selection } = rollFromTemplate(sampleLayers, { alwaysLayerIds: [], neverLayerIds: ['background'], excludedTraitPaths: [] });
  assert.equal(selection.background, undefined);
  assert.ok(selection.body);
});

test('rollFromTemplate skips empty layers and reports always misses', () => {
  const { selection, missingAlways } = rollFromTemplate(sampleLayers, {
    alwaysLayerIds: ['hat'],
    neverLayerIds: [],
    excludedTraitPaths: [],
  });
  assert.equal(selection.hat, undefined);
  assert.deepEqual(missingAlways, ['hat']);
});

test('rollFromTemplate honors excludedTraitPaths', () => {
  const dawnPath = sampleLayers[0].traits[0].relativePath;
  for (let i = 0; i < 30; i += 1) {
    const { selection } = rollFromTemplate(sampleLayers, {
      alwaysLayerIds: [],
      neverLayerIds: [],
      excludedTraitPaths: [dawnPath],
    });
    assert.equal(selection.background, sampleLayers[0].traits[1].id);
  }
});

test('rollFromTemplate applies trait pairs bidirectionally', () => {
  const a = sampleLayers[0].traits[0]; // bg-dawn
  const b = sampleLayers[1].traits[0]; // body-cream
  const weights = {
    [sampleLayers[0].traits[0].relativePath]: 1,
    [sampleLayers[0].traits[1].relativePath]: 0,
    [sampleLayers[1].traits[0].relativePath]: 0,
    [sampleLayers[1].traits[1].relativePath]: 1,
  };
  // bg always dawn, body always ghost — pair forces body→cream because dawn rolled.
  const { selection } = rollFromTemplate(
    sampleLayers,
    { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [] },
    weights,
    Math.random,
    { traitPairs: [{ a: a.relativePath, b: b.relativePath }] },
  );
  assert.equal(selection.background, a.id);
  assert.equal(selection.body, b.id);
});

test('rollFromTemplate applies layerExclusions when source layer rolls', () => {
  const { selection } = rollFromTemplate(
    sampleLayers,
    { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [] },
    {},
    Math.random,
    { layerExclusions: [{ sourceLayerId: 'background', excludeLayerIds: ['body'] }] },
  );
  assert.ok(selection.background);
  assert.equal(selection.body, undefined);
});

test('rollFromTemplate supports template-scoped layer chance', () => {
  const template = {
    alwaysLayerIds: [],
    neverLayerIds: [],
    excludedTraitPaths: [],
    layerRules: [{ layerId: 'background', chancePercent: 10, excludeLayerIds: [] }],
  };

  const missed = rollFromTemplate(sampleLayers, template, {}, sequenceRng([0.5, 0]));
  assert.equal(missed.selection.background, undefined);
  assert.ok(missed.selection.body);

  const hit = rollFromTemplate(sampleLayers, template, {}, sequenceRng([0.05, 0, 0]));
  assert.equal(hit.selection.background, sampleLayers[0].traits[0].id);
});

test('rollFromTemplate applies template-scoped layer skips only when the source appears', () => {
  const template = {
    alwaysLayerIds: [],
    neverLayerIds: [],
    excludedTraitPaths: [],
    layerRules: [{ layerId: 'background', chancePercent: 10, excludeLayerIds: ['body'] }],
  };

  const missed = rollFromTemplate(sampleLayers, template, {}, sequenceRng([0.5, 0]));
  assert.equal(missed.selection.background, undefined);
  assert.ok(missed.selection.body);

  const hit = rollFromTemplate(sampleLayers, template, {}, sequenceRng([0.05, 0, 0]));
  assert.equal(hit.selection.background, sampleLayers[0].traits[0].id);
  assert.equal(hit.selection.body, undefined);
});

test('pickTemplateKind respects templateAWeight bounds', () => {
  assert.equal(pickTemplateKind(100, () => 0.5), 'templateA');
  assert.equal(pickTemplateKind(0, () => 0.5), 'templateB');
  assert.equal(pickTemplateKind(50, () => 0.49), 'templateA');
  assert.equal(pickTemplateKind(50, () => 0.51), 'templateB');
});

test('setLayerTemplateState toggles between always/never/optional', () => {
  let template: { alwaysLayerIds: string[]; neverLayerIds: string[]; excludedTraitPaths: string[] } = {
    alwaysLayerIds: [],
    neverLayerIds: [],
    excludedTraitPaths: [],
  };
  template = setLayerTemplateState(template, 'body', 'always');
  assert.equal(getLayerTemplateState(template, 'body'), 'always');
  template = setLayerTemplateState(template, 'body', 'never');
  assert.equal(getLayerTemplateState(template, 'body'), 'never');
  assert.deepEqual(template.alwaysLayerIds, []);
  template = setLayerTemplateState(template, 'body', 'optional');
  assert.equal(getLayerTemplateState(template, 'body'), 'optional');
  assert.deepEqual(template.neverLayerIds, []);
});

test('setTemplateLayerRule stores chance and skip targets compactly', () => {
  let template = setTemplateLayerRule(
    { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [], layerRules: [] },
    'background',
    { chancePercent: 10, excludeLayerIds: ['body', 'background'] },
  );

  assert.deepEqual(getTemplateLayerRule(template, 'background'), {
    layerId: 'background',
    chancePercent: 10,
    excludeLayerIds: ['body'],
  });

  template = setTemplateLayerRule(template, 'background', { chancePercent: 100, excludeLayerIds: [] });
  assert.deepEqual(template.layerRules, []);
});

test('pickWeightedTrait skips zero-weight traits', () => {
  const traits = sampleLayers[0].traits;
  const weights = {
    [traits[0].relativePath]: 0,
    [traits[1].relativePath]: 1,
  };
  for (let i = 0; i < 50; i += 1) {
    const picked = pickWeightedTrait(traits, weights);
    assert.equal(picked?.id, traits[1].id);
  }
});

test('pickWeightedTrait returns null when all weights are zero', () => {
  const traits = sampleLayers[0].traits;
  const weights = Object.fromEntries(traits.map((t) => [t.relativePath, 0]));
  assert.equal(pickWeightedTrait(traits, weights), null);
});

test('pickWeightedTrait dominant weight wins almost always', () => {
  const traits = sampleLayers[0].traits;
  const weights = {
    [traits[0].relativePath]: 99,
    [traits[1].relativePath]: 1,
  };
  let dawnHits = 0;
  for (let i = 0; i < 1000; i += 1) {
    if (pickWeightedTrait(traits, weights)?.id === traits[0].id) dawnHits += 1;
  }
  assert.ok(dawnHits > 900, `expected >900 dawn hits, got ${dawnHits}`);
});

test('rollFromTemplate honors weights', () => {
  const layers = [sampleLayers[0]];
  const weights = {
    [layers[0].traits[0].relativePath]: 0,
    [layers[0].traits[1].relativePath]: 5,
  };
  for (let i = 0; i < 30; i += 1) {
    const { selection } = rollFromTemplate(layers, { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [] }, weights);
    assert.equal(selection[layers[0].id], layers[0].traits[1].id);
  }
});

test('templateCapacity multiplies viable traits and skips Never layers', () => {
  // sampleLayers: background (2), body (2), hat (0 traits)
  const cap = templateCapacity(sampleLayers, { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [] });
  assert.equal(cap, 4);

  const capWithNeverBody = templateCapacity(sampleLayers, { alwaysLayerIds: [], neverLayerIds: ['body'], excludedTraitPaths: [] });
  assert.equal(capWithNeverBody, 2);

  const weights = { [sampleLayers[0].traits[0].relativePath]: 0 };
  const capWithZeroWeight = templateCapacity(sampleLayers, { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [] }, weights);
  assert.equal(capWithZeroWeight, 2); // background drops dawn, only night viable; body still 2
});

test('templateCapacity counts absent states for chance-based optional layers', () => {
  const chanceCap = templateCapacity(sampleLayers, {
    alwaysLayerIds: [],
    neverLayerIds: [],
    excludedTraitPaths: [],
    layerRules: [{ layerId: 'background', chancePercent: 10, excludeLayerIds: [] }],
  });
  assert.equal(chanceCap, 6); // background none/dawn/night x body cream/ghost

  const zeroChanceCap = templateCapacity(sampleLayers, {
    alwaysLayerIds: [],
    neverLayerIds: [],
    excludedTraitPaths: [],
    layerRules: [{ layerId: 'background', chancePercent: 0, excludeLayerIds: [] }],
  });
  assert.equal(zeroChanceCap, 2);

  const alwaysCap = templateCapacity(sampleLayers, {
    alwaysLayerIds: ['background'],
    neverLayerIds: [],
    excludedTraitPaths: [],
    layerRules: [{ layerId: 'background', chancePercent: 10, excludeLayerIds: [] }],
  });
  assert.equal(alwaysCap, 4);
});

test('simulateCollection hits target uniques when capacity is sufficient', () => {
  // capacity = 4 (sheep) + 4 (wolves but rolled separately by template kind, fingerprints prefixed)
  const templates = {
    templateA: { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [] },
    templateB: { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [] },
    templateAWeight: 50,
    traitPairs: [],
    layerExclusions: [],
  };
  const result = simulateCollection({
    layers: sampleLayers,
    layerOrder: ['background', 'body', 'hat'],
    templates,
    targetSize: 6,
    attemptsMultiplier: 50,
  });
  assert.ok(result.uniqueCount >= 6, `expected at least 6 uniques, got ${result.uniqueCount}`);
  assert.equal(result.targetSize, 6);
  assert.ok(result.totalAttempts >= 6);
});

test('simulateCollection caps attempts when target is unreachable', () => {
  const templates = {
    templateA: { alwaysLayerIds: [], neverLayerIds: ['background', 'body', 'hat'], excludedTraitPaths: [] },
    templateB: { alwaysLayerIds: [], neverLayerIds: ['background', 'body', 'hat'], excludedTraitPaths: [] },
    templateAWeight: 50,
    traitPairs: [],
    layerExclusions: [],
  };
  const result = simulateCollection({
    layers: sampleLayers,
    layerOrder: ['background', 'body', 'hat'],
    templates,
    targetSize: 100,
  });
  // Every roll yields the same empty selection → only 2 unique fingerprints (sheep|... and wolves|...)
  assert.ok(result.uniqueCount <= 2);
  assert.ok(result.totalAttempts >= 100);
});

test('normalizeCollectionTemplates falls back to defaults on garbage input', () => {
  const normalized = normalizeCollectionTemplates(undefined);
  assert.equal(normalized.templateAWeight, DEFAULT_TEMPLATES.templateAWeight);
  assert.deepEqual(normalized.templateA, DEFAULT_TEMPLATES.templateA);
  assert.deepEqual(normalized.templateB, DEFAULT_TEMPLATES.templateB);
  assert.deepEqual(normalized.traitPairs, []);
  assert.deepEqual(normalized.layerExclusions, []);

  const clampedHigh = normalizeCollectionTemplates({ templateAWeight: 999 });
  assert.equal(clampedHigh.templateAWeight, 100);

  const clampedLow = normalizeCollectionTemplates({ templateAWeight: -42 });
  assert.equal(clampedLow.templateAWeight, 0);
});

test('normalizeCollectionTemplates dedupes trait pairs and rejects self-pairs', () => {
  const normalized = normalizeCollectionTemplates({
    traitPairs: [
      { a: 'x.png', b: 'y.png' },
      { a: 'y.png', b: 'x.png' },
      { a: 'z.png', b: 'z.png' },
      { a: '', b: 'q.png' },
    ],
  });
  assert.equal(normalized.traitPairs.length, 1);
  assert.deepEqual(normalized.traitPairs[0], { a: 'x.png', b: 'y.png' });
});

test('normalizeCollectionTemplates merges layer exclusions by source', () => {
  const normalized = normalizeCollectionTemplates({
    layerExclusions: [
      { sourceLayerId: 'hair', excludeLayerIds: ['hat'] },
      { sourceLayerId: 'hair', excludeLayerIds: ['cape', 'hair'] }, // hair is self → drop
      { sourceLayerId: '', excludeLayerIds: ['x'] },
    ],
  });
  assert.equal(normalized.layerExclusions.length, 1);
  assert.equal(normalized.layerExclusions[0].sourceLayerId, 'hair');
  assert.deepEqual(normalized.layerExclusions[0].excludeLayerIds.sort(), ['cape', 'hat']);
});

test('normalizeCollectionTemplates normalizes template layer rules', () => {
  const normalized = normalizeCollectionTemplates({
    templateA: {
      layerRules: [
        { layerId: 'coat', chancePercent: 10, excludeLayerIds: ['shirt', 'coat'] },
        { layerId: 'coat', chancePercent: 15, excludeLayerIds: ['hat'] },
        { layerId: 'plain', chancePercent: 100, excludeLayerIds: [] },
      ],
    },
  });

  assert.deepEqual(normalized.templateA.layerRules, [
    { layerId: 'coat', chancePercent: 15, excludeLayerIds: ['shirt', 'hat'] },
  ]);
});

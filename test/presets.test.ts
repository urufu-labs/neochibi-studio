import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSavedConfig,
  hydrateSavedConfig,
  parseSavedConfig,
  serializeSavedConfig,
  type SavedGeneratorConfig,
} from '../lib/art-generator/presets';

test('createSavedConfig captures root, layer order, and selected traits', () => {
  const config = createSavedConfig({
    name: 'demo preset',
    rootDir: '/tmp/neochibi',
    layerOrder: ['background', 'body', 'eyes'],
    selectedTraits: {
      background: 'bg-night',
      body: 'body-charcoal',
      eyes: 'eyes-sleepy',
    },
  });

  assert.equal(config.name, 'demo preset');
  assert.equal(config.rootDir, '/tmp/neochibi');
  assert.deepEqual(config.layerOrder, ['background', 'body', 'eyes']);
  assert.equal(config.selectedTraits.eyes, 'eyes-sleepy');
  assert.match(config.id, /^cfg_/);
  assert.equal(typeof config.updatedAt, 'string');
});

test('parseSavedConfig validates raw JSON-like objects', () => {
  const parsed = parseSavedConfig({
    id: 'cfg_existing',
    name: '  demo preset  ',
    rootDir: '/tmp/neochibi',
    layerOrder: ['background'],
    selectedTraits: { background: 'bg-night' },
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(parsed.id, 'cfg_existing');
  assert.equal(parsed.name, 'demo preset');
  assert.equal(parsed.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('serializeSavedConfig writes readable JSON', () => {
  const config = createSavedConfig({
    id: 'cfg_json',
    name: 'json demo',
    rootDir: '/tmp/neochibi',
    layerOrder: ['background'],
    selectedTraits: { background: 'bg-night' },
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  assert.match(serializeSavedConfig(config), /"name": "json demo"/);
});

test('hydrateSavedConfig drops layers and traits that no longer exist', () => {
  const config: SavedGeneratorConfig = {
    id: 'cfg_old',
    name: 'old setup',
    rootDir: '/tmp/neochibi',
    layerOrder: ['background', 'hat', 'body'],
    selectedTraits: {
      background: 'bg-dawn',
      hat: 'hat-none',
      body: 'body-cream',
    },
    effects: [],
    rules: {
      template: { alwaysLayerIds: [], neverLayerIds: [], excludedTraitPaths: [] },
      traitPairs: [],
      traitConflicts: [],
      layerExclusions: [],
    },
    updatedAt: new Date().toISOString(),
  };

  const hydrated = hydrateSavedConfig(config, {
    rootDir: '/tmp/neochibi',
    layers: [
      {
        id: 'background',
        name: 'Background',
        directoryName: '01 Background',
        traits: [{ id: 'bg-dawn', name: 'Dawn', relativePath: '01 Background/01 Dawn.png', extension: 'png', version: 0 }],
      },
      {
        id: 'body',
        name: 'Body',
        directoryName: '02 Body',
        traits: [{ id: 'body-cream', name: 'Cream', relativePath: '02 Body/01 Cream.png', extension: 'png', version: 0 }],
      },
    ],
  });

  assert.deepEqual(hydrated.layerOrder, ['background', 'body']);
  assert.deepEqual(hydrated.selectedTraits, {
    background: 'bg-dawn',
    body: 'body-cream',
  });
});

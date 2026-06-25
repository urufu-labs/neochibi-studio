import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNewTraitFileName, inferTraitNameFromFileName, normalizePendingNewTrait } from '../lib/art-generator/paste-traits';

test('buildNewTraitFileName creates a safe png filename from the requested trait name', () => {
  assert.equal(buildNewTraitFileName('Sleepy Half-Lids'), 'Sleepy Half-Lids.png');
  assert.equal(buildNewTraitFileName('  ??? Brutal//Cute  '), 'Brutal Cute.png');
});

test('inferTraitNameFromFileName strips extension and falls back for bad names', () => {
  assert.equal(inferTraitNameFromFileName('Sleepy Half-Lids.png'), 'Sleepy Half-Lids');
  assert.equal(inferTraitNameFromFileName(''), 'pasted-trait');
});

test('normalizePendingNewTrait fills sensible defaults and trims input', () => {
  assert.deepEqual(normalizePendingNewTrait({ layerName: ' body ', traitName: '  sleepy-variant ' }, 'background'), {
    layerName: 'body',
    traitName: 'sleepy-variant',
  });

  assert.deepEqual(normalizePendingNewTrait({ layerName: '', traitName: '' }, 'hair'), {
    layerName: 'hair',
    traitName: 'pasted-trait',
  });
});

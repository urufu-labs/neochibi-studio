import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { listStoredConfigs, saveStoredConfig, deleteStoredConfig } from '../lib/art-generator/config-store';
import { createSavedConfig } from '../lib/art-generator/presets';

test('saveStoredConfig persists readable json and listStoredConfigs returns it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'neochibi-config-store-'));

  try {
    const config = createSavedConfig({
      id: 'cfg_demo',
      name: 'demo preset',
      rootDir: root,
      layerOrder: ['background', 'body'],
      selectedTraits: { background: 'bg-night', body: 'body-charcoal' },
      updatedAt: '2026-04-23T20:11:00.000Z',
    });

    const saved = await saveStoredConfig(root, config);
    const filePath = path.join(root, '.studio-configs', 'cfg_demo.json');

    assert.equal(saved.fileName, 'cfg_demo.json');
    assert.match(await readFile(filePath, 'utf8'), /"demo preset"/);

    const configs = await listStoredConfigs(root);
    assert.equal(configs.length, 1);
    assert.equal(configs[0].id, 'cfg_demo');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('deleteStoredConfig removes saved config files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'neochibi-config-store-'));

  try {
    await saveStoredConfig(
      root,
      createSavedConfig({
        id: 'cfg_remove',
        name: 'delete me',
        rootDir: root,
        layerOrder: ['background'],
        selectedTraits: { background: 'bg-night' },
      }),
    );

    await deleteStoredConfig(root, 'cfg_remove');

    const configs = await listStoredConfigs(root);
    assert.deepEqual(configs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

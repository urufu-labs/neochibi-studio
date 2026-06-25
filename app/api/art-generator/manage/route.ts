import { NextResponse } from 'next/server';

import {
  createLayerDirectory,
  deleteAsset,
  deleteLayerDirectory,
  renameAsset,
  renameLayerDirectory,
  reorderLayerDirectories,
  scanTraitRoot,
} from '@/lib/art-generator/library';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? '');
    const rootDir = String(payload.rootDir ?? '').trim();

    if (!rootDir) {
      return NextResponse.json({ error: 'Missing rootDir.' }, { status: 400 });
    }

    const meta: Record<string, unknown> = {};

    if (action === 'createLayer') {
      await createLayerDirectory({
        rootDir,
        layerName: String(payload.layerName ?? ''),
        preferredOrder: payload.preferredOrder ? Number(payload.preferredOrder) : undefined,
      });
    } else if (action === 'renameLayer') {
      const result = await renameLayerDirectory(
        rootDir,
        String(payload.layerDirectoryName ?? ''),
        String(payload.nextLayerName ?? ''),
      );
      meta.renameLayer = {
        oldDirectoryName: String(payload.layerDirectoryName ?? ''),
        newDirectoryName: result.layerDirectoryName,
      };
    } else if (action === 'deleteLayer') {
      await deleteLayerDirectory(rootDir, String(payload.layerDirectoryName ?? ''));
    } else if (action === 'reorderLayers') {
      await reorderLayerDirectories(rootDir, Array.isArray(payload.orderedDirectoryNames) ? payload.orderedDirectoryNames.map(String) : []);
    } else if (action === 'renameTrait') {
      const oldRelativePath = String(payload.assetRelativePath ?? '');
      const result = await renameAsset(rootDir, oldRelativePath, String(payload.nextFileName ?? ''));
      meta.renameTrait = {
        oldRelativePath,
        newRelativePath: result.relativePath,
      };
    } else if (action === 'deleteTrait') {
      await deleteAsset(rootDir, String(payload.assetRelativePath ?? ''));
    } else {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    const library = await scanTraitRoot(rootDir);
    return NextResponse.json({ library, meta });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to manage art assets.' },
      { status: 400 },
    );
  }
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { assertSafeAssetPath } from '@/lib/art-generator/library';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rootDir = searchParams.get('root')?.trim();
  const assetRelativePath = searchParams.get('asset')?.trim();

  if (!rootDir || !assetRelativePath) {
    return NextResponse.json({ error: 'Missing root or asset query parameter.' }, { status: 400 });
  }

  try {
    const resolvedPath = await assertSafeAssetPath(rootDir, assetRelativePath);
    const buffer = await readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();

    return new NextResponse(buffer, {
      headers: {
        'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read asset.' },
      { status: 400 },
    );
  }
}

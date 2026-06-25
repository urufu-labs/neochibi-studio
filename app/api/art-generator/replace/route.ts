import { NextResponse } from 'next/server';

import { replaceAsset, scanTraitRoot } from '@/lib/art-generator/library';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rootDir = String(formData.get('rootDir') ?? '').trim();
    const assetRelativePath = String(formData.get('assetRelativePath') ?? '').trim();
    const file = formData.get('file');

    if (!rootDir) {
      return NextResponse.json({ error: 'Missing rootDir.' }, { status: 400 });
    }

    if (!assetRelativePath) {
      return NextResponse.json({ error: 'Missing assetRelativePath.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing replacement file upload.' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const replacement = await replaceAsset(rootDir, assetRelativePath, bytes);
    const library = await scanTraitRoot(rootDir);

    return NextResponse.json({ replacement, library });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to replace trait asset.' },
      { status: 400 },
    );
  }
}
